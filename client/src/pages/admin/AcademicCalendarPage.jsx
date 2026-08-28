import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Calendar,
  Globe,
  Zap,
  Check,
  X,
  Info,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
  isWithinInterval,
  addMonths,
  subMonths,
} from 'date-fns';
import { calendarService } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import {
  generateAcademicYearOptions,
  getCurrentAcademicYear,
} from '../../utils/academicYear';
import useQuickAction from '../../utils/useQuickAction';

// ── Constants ─────────────────────────────────────────────────────────────────
const EVENT_TYPES = [
  'Term Start',
  'Term End',
  'Exam',
  'Holiday',
  'Event',
  'PTA Meeting',
  'Sports Day',
  'Cultural Day',
  'Resumption',
  'Closing',
  'Other',
];
const EVENT_COLORS = {
  'Term Start': '#10B981',
  'Term End': '#EF4444',
  Exam: '#7C3AED',
  Holiday: '#F59E0B',
  Event: '#0891B2',
  'PTA Meeting': '#EC4899',
  'Sports Day': '#F97316',
  'Cultural Day': '#84CC16',
  Resumption: '#10B981',
  Closing: '#EF4444',
  Other: '#6B7280',
};
const TERMS = ['First Term', 'Second Term', 'Third Term'];

const EMPTY_EVENT = {
  title: '',
  type: 'Event',
  startDate: '',
  endDate: '',
  isAllDay: true,
  description: '',
  targetAudience: ['All'],
  color: '',
};

const EMPTY_TERM = {
  name: 'First Term',
  startDate: '',
  endDate: '',
  midTermBreakStart: '',
  midTermBreakEnd: '',
  examStartDate: '',
  examEndDate: '',
  resumptionDate: '',
};
const EMPTY_CALENDAR = {
  academicYear: getCurrentAcademicYear(),
  sessionStartDate: '',
  sessionEndDate: '',
  notes: '',
  terms: [
    { ...EMPTY_TERM, name: 'First Term' },
    { ...EMPTY_TERM, name: 'Second Term' },
    { ...EMPTY_TERM, name: 'Third Term' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function toInput(date) {
  if (!date) return '';
  try {
    return format(new Date(date), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

function eventDot(color) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

const academicYears = generateAcademicYearOptions({
  count: 3,
  includeFuture: true,
});

// ─────────────────────────────────────────────────────────────────────────────
export default function AcademicCalendarPage() {
  const [calendars, setCalendars] = useState([]);
  const [selected, setSelected] = useState(null); // active calendar object
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(new Date());
  const [rightPanel, setRightPanel] = useState('events'); // 'events' | 'terms'
  const [dayEvents, setDayEvents] = useState(null); // { date, events[] }

  // Modals
  const [calModal, setCalModal] = useState(null); // null | 'create' | 'edit'
  const [calForm, setCalForm] = useState(EMPTY_CALENDAR);
  const [savingCal, setSavingCal] = useState(false);
  const [eventModal, setEventModal] = useState(null); // null | 'create' | 'edit'
  const [eventForm, setEventForm] = useState(EMPTY_EVENT);
  const [editEventId, setEditEventId] = useState(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [deleteCalTarget, setDeleteCalTarget] = useState(null);
  const [deleteEventTarget, setDeleteEventTarget] = useState(null);
  const [deletingCal, setDeletingCal] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await calendarService.getAll();
      const list = r.data.data?.calendars || [];
      setCalendars(list);
      // Auto-select the active one, or the first
      if (!selected) {
        const active = list.find((c) => c.isActive) || list[0] || null;
        setSelected(active);
        if (active?.sessionStartDate) {
          setViewMonth(new Date(active.sessionStartDate));
        }
      } else {
        // Refresh selected object
        const updated = list.find((c) => c._id === selected._id);
        setSelected(updated || list[0] || null);
      }
    } catch {
      toast.error('Failed to load calendars');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line

  // ── Month grid ────────────────────────────────────────────────────────
  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const eventsForDay = useCallback(
    (day) => {
      if (!selected) return [];
      return (selected.events || []).filter((ev) => {
        const s = new Date(ev.startDate);
        const e = new Date(ev.endDate || ev.startDate);
        s.setHours(0, 0, 0, 0);
        e.setHours(23, 59, 59, 999);
        return day >= s && day <= e;
      });
    },
    [selected],
  );

  const termForDay = useCallback(
    (day) => {
      if (!selected) return null;
      return (selected.terms || []).find((t) => {
        if (!t.startDate || !t.endDate) return false;
        return day >= new Date(t.startDate) && day <= new Date(t.endDate);
      });
    },
    [selected],
  );

  // ── Calendar CRUD ─────────────────────────────────────────────────────
  const openCreateCal = () => {
    setCalForm(EMPTY_CALENDAR);
    setCalModal('create');
  };
  const openEditCal = () => {
    if (!selected) return;
    setCalForm({
      academicYear: selected.academicYear,
      sessionStartDate: toInput(selected.sessionStartDate),
      sessionEndDate: toInput(selected.sessionEndDate),
      notes: selected.notes || '',
      terms: (selected.terms || []).map((t) => ({
        name: t.name,
        startDate: toInput(t.startDate),
        endDate: toInput(t.endDate),
        midTermBreakStart: toInput(t.midTermBreakStart),
        midTermBreakEnd: toInput(t.midTermBreakEnd),
        examStartDate: toInput(t.examStartDate),
        examEndDate: toInput(t.examEndDate),
        resumptionDate: toInput(t.resumptionDate),
      })),
    });
    setCalModal('edit');
  };

  const setTermField = (i, key, val) =>
    setCalForm((f) => ({
      ...f,
      terms: f.terms.map((t, idx) => (idx === i ? { ...t, [key]: val } : t)),
    }));

  const handleCalSave = async (e) => {
    e.preventDefault();
    if (!calForm.academicYear) return toast.error('Academic year is required');
    setSavingCal(true);
    try {
      if (calModal === 'create') {
        const r = await calendarService.create(calForm);
        setSelected(r.data.data.calendar);
        toast.success('Calendar created');
      } else {
        await calendarService.update(selected._id, calForm);
        toast.success('Calendar updated');
      }
      setCalModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSavingCal(false);
    }
  };

  const handleDeleteCal = async () => {
    setDeletingCal(true);
    try {
      await calendarService.delete(deleteCalTarget);
      toast.success('Calendar deleted');
      setDeleteCalTarget(null);
      setSelected(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeletingCal(false);
    }
  };

  const handlePublish = async () => {
    if (!selected) return;
    try {
      await calendarService.publish(selected._id);
      toast.success('Calendar published — visible to all users');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Publish failed');
    }
  };

  const handleActivate = async () => {
    if (!selected) return;
    try {
      await calendarService.activate(selected._id);
      toast.success(`${selected.academicYear} set as the active session`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Activate failed');
    }
  };

  // ── Event CRUD ────────────────────────────────────────────────────────
  const openAddEvent = (prefillDate = '') => {
    setEventForm({
      ...EMPTY_EVENT,
      startDate: prefillDate,
      endDate: prefillDate,
    });
    setEditEventId(null);
    setEventModal('create');
  };
  useQuickAction('event', openAddEvent);

  const openEditEvent = (ev) => {
    setEventForm({
      title: ev.title,
      type: ev.type,
      startDate: toInput(ev.startDate),
      endDate: toInput(ev.endDate || ev.startDate),
      isAllDay: ev.isAllDay !== false,
      description: ev.description || '',
      targetAudience: ev.targetAudience || ['All'],
      color: ev.color || '',
    });
    setEditEventId(ev._id);
    setEventModal('edit');
  };

  const handleEventSave = async (e) => {
    e.preventDefault();
    if (!selected) return;
    if (!eventForm.title || !eventForm.startDate)
      return toast.error('Title and start date required');
    setSavingEvent(true);
    try {
      if (eventModal === 'create') {
        await calendarService.addEvent(selected._id, eventForm);
        toast.success('Event added');
      } else {
        await calendarService.updateEvent(selected._id, editEventId, eventForm);
        toast.success('Event updated');
      }
      setEventModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async () => {
    try {
      await calendarService.deleteEvent(selected._id, deleteEventTarget);
      toast.success('Event removed');
      setDeleteEventTarget(null);
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  // ── Sorted events list ────────────────────────────────────────────────
  const sortedEvents = useMemo(() => {
    if (!selected) return [];
    return [...(selected.events || [])].sort(
      (a, b) => new Date(a.startDate) - new Date(b.startDate),
    );
  }, [selected]);

  // Upcoming events (from today)
  const upcomingEvents = sortedEvents.filter(
    (e) => new Date(e.endDate || e.startDate) >= new Date(),
  );
  const pastEvents = sortedEvents.filter(
    (e) => new Date(e.endDate || e.startDate) < new Date(),
  );

  // ─────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ───────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Academic Calendar</h1>
          <p className="page-header__subtitle">
            Manage academic sessions, terms and school events
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {selected && !selected.isPublished && (
            <button className="btn btn--secondary" onClick={handlePublish}>
              <Globe size={15} /> Publish
            </button>
          )}
          {selected && !selected.isActive && (
            <button className="btn btn--secondary" onClick={handleActivate}>
              <Zap size={15} /> Set Active
            </button>
          )}
          <button className="btn btn--primary" onClick={openCreateCal}>
            <Plus size={15} /> New Calendar
          </button>
        </div>
      </div>

      {/* ── Calendar selector tabs ─────────────────────────────────── */}
      {calendars.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 20,
            flexWrap: 'wrap',
          }}
        >
          {calendars.map((cal) => (
            <button
              key={cal._id}
              onClick={() => {
                setSelected(cal);
                setViewMonth(new Date(cal.sessionStartDate));
              }}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                fontWeight: 500,
                border: `1.5px solid ${selected?._id === cal._id ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                background:
                  selected?._id === cal._id
                    ? 'var(--clr-primary)'
                    : 'var(--clr-surface)',
                color: selected?._id === cal._id ? '#fff' : 'var(--clr-text-2)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {cal.academicYear}
              {cal.isActive && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    background: '#10B981',
                    color: '#fff',
                    padding: '1px 5px',
                    borderRadius: 4,
                  }}
                >
                  Active
                </span>
              )}
              {!cal.isPublished && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    background: '#F59E0B',
                    color: '#fff',
                    padding: '1px 5px',
                    borderRadius: 4,
                  }}
                >
                  Draft
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" />
        </div>
      ) : !selected ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '60px 24px' }}>
            <Calendar size={48} className="empty-state__icon" />
            <p className="empty-state__title">No academic calendars yet</p>
            <p className="empty-state__text">
              Create a calendar to define your academic year, terms, holidays
              and events.
            </p>
            <button
              className="btn btn--primary btn--sm"
              style={{ marginTop: 12 }}
              onClick={openCreateCal}
            >
              <Plus size={14} /> Create Calendar
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 340px',
            gap: 20,
            alignItems: 'start',
          }}
        >
          {/* ── LEFT: Month calendar ────────────────────────────────── */}
          <div className="card">
            {/* Month nav */}
            <div className="card__header" style={{ gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className="btn btn--ghost btn--sm btn--icon"
                  onClick={() => setViewMonth((m) => subMonths(m, 1))}
                >
                  <ChevronLeft size={16} />
                </button>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '1.0625rem',
                    minWidth: 160,
                    textAlign: 'center',
                  }}
                >
                  {format(viewMonth, 'MMMM yyyy')}
                </span>
                <button
                  className="btn btn--ghost btn--sm btn--icon"
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setViewMonth(new Date())}
                >
                  Today
                </button>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => openAddEvent(format(new Date(), 'yyyy-MM-dd'))}
                >
                  <Plus size={13} /> Add Event
                </button>
              </div>
            </div>

            <div style={{ padding: '12px 16px' }}>
              {/* Day headers */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7,1fr)',
                  marginBottom: 4,
                }}
              >
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div
                    key={d}
                    style={{
                      textAlign: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--clr-text-3)',
                      padding: '4px 0',
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7,1fr)',
                  gap: 2,
                }}
              >
                {monthDays.map((day) => {
                  const inMonth = isSameMonth(day, viewMonth);
                  const isToday_ = isToday(day);
                  const term = termForDay(day);
                  const dayEvs = eventsForDay(day);
                  const isSelected =
                    dayEvents && isSameDay(day, new Date(dayEvents.date));

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => {
                        if (dayEvs.length > 0 || term)
                          setDayEvents({ date: day, events: dayEvs, term });
                      }}
                      style={{
                        minHeight: 72,
                        padding: '4px 5px',
                        borderRadius: 6,
                        cursor:
                          dayEvs.length > 0 || term ? 'pointer' : 'default',
                        background: isSelected
                          ? 'var(--clr-bg-alt)'
                          : term
                            ? `${term.name === 'First Term' ? '#d1fae5' : term.name === 'Second Term' ? '#dbeafe' : '#ede9fe'}55`
                            : 'transparent',
                        border: `1px solid ${isSelected ? 'var(--clr-primary)' : isToday_ ? 'var(--clr-accent)' : 'var(--clr-border)'}`,
                        opacity: inMonth ? 1 : 0.35,
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* Date number */}
                      <div style={{ textAlign: 'right', marginBottom: 2 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            width: 22,
                            height: 22,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            fontSize: '0.75rem',
                            fontWeight: isToday_ ? 700 : 400,
                            background: isToday_
                              ? 'var(--clr-primary)'
                              : 'transparent',
                            color: isToday_
                              ? '#fff'
                              : inMonth
                                ? 'var(--clr-text-1)'
                                : 'var(--clr-text-3)',
                          }}
                        >
                          {format(day, 'd')}
                        </span>
                      </div>

                      {/* Event dots */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                      >
                        {dayEvs.slice(0, 3).map((ev) => (
                          <div
                            key={ev._id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                              overflow: 'hidden',
                            }}
                          >
                            {eventDot(
                              ev.color || EVENT_COLORS[ev.type] || '#6B7280',
                            )}
                            <span
                              style={{
                                fontSize: '0.6rem',
                                color: 'var(--clr-text-2)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.2,
                              }}
                            >
                              {ev.title}
                            </span>
                          </div>
                        ))}
                        {dayEvs.length > 3 && (
                          <span
                            style={{
                              fontSize: '0.6rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            +{dayEvs.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Term legend */}
              {(selected.terms || []).length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    marginTop: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  {[
                    { name: 'First Term', color: '#d1fae5', text: '#065f46' },
                    { name: 'Second Term', color: '#dbeafe', text: '#1e40af' },
                    { name: 'Third Term', color: '#ede9fe', text: '#5b21b6' },
                  ].map((t) => (
                    <div
                      key={t.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: '0.75rem',
                      }}
                    >
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 2,
                          background: t.color,
                          border: `1px solid ${t.color}`,
                        }}
                      />
                      <span style={{ color: 'var(--clr-text-3)' }}>
                        {t.name}
                      </span>
                    </div>
                  ))}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: 'var(--clr-primary)',
                      }}
                    />
                    <span style={{ color: 'var(--clr-text-3)' }}>Today</span>
                  </div>
                </div>
              )}
            </div>

            {/* Day detail panel */}
            {dayEvents && (
              <div
                style={{
                  borderTop: '1px solid var(--clr-border)',
                  padding: '12px 16px',
                  background: 'var(--clr-bg)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                    {format(new Date(dayEvents.date), 'EEEE, dd MMMM')}
                    {dayEvents.term && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: '0.75rem',
                          color: 'var(--clr-text-3)',
                        }}
                      >
                        · {dayEvents.term.name}
                      </span>
                    )}
                  </span>
                  <button
                    className="btn btn--ghost btn--sm btn--icon"
                    onClick={() => setDayEvents(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
                {dayEvents.events.length === 0 ? (
                  <p
                    style={{ color: 'var(--clr-text-3)', fontSize: '0.875rem' }}
                  >
                    No events on this day
                  </p>
                ) : (
                  dayEvents.events.map((ev) => (
                    <div
                      key={ev._id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '7px 0',
                        borderBottom: '1px solid var(--clr-border)',
                      }}
                    >
                      <div
                        style={{
                          width: 4,
                          alignSelf: 'stretch',
                          borderRadius: 2,
                          background:
                            ev.color || EVENT_COLORS[ev.type] || '#6B7280',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                          {ev.title}
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          {ev.type}
                        </div>
                        {ev.description && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--clr-text-3)',
                              marginTop: 2,
                            }}
                          >
                            {ev.description}
                          </div>
                        )}
                      </div>
                      <button
                        className="btn btn--ghost btn--sm btn--icon"
                        onClick={() => openEditEvent(ev)}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        className="btn btn--ghost btn--sm btn--icon"
                        style={{ color: 'var(--clr-danger)' }}
                        onClick={() => setDeleteEventTarget(ev._id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: Events + Terms panel ─────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Calendar info card */}
            <div className="card">
              <div style={{ padding: '14px 16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        fontSize: '1.0625rem',
                      }}
                    >
                      {selected.academicYear}
                    </div>
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--clr-text-3)',
                        marginTop: 2,
                      }}
                    >
                      {toInput(selected.sessionStartDate)} →{' '}
                      {toInput(selected.sessionEndDate)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {selected.isActive && (
                      <span className="badge badge--success">Active</span>
                    )}
                    {selected.isPublished ? (
                      <span className="badge badge--info">Published</span>
                    ) : (
                      <span className="badge badge--warning">Draft</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={openEditCal}
                  >
                    <Edit2 size={12} /> Edit
                  </button>
                  {!selected.isPublished && (
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={handlePublish}
                    >
                      <Globe size={12} /> Publish
                    </button>
                  )}
                  {!selected.isActive && (
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={handleActivate}
                    >
                      <Zap size={12} /> Set Active
                    </button>
                  )}
                  {!selected.isActive && (
                    <button
                      className="btn btn--ghost btn--sm btn--icon"
                      style={{ color: 'var(--clr-danger)' }}
                      onClick={() => setDeleteCalTarget(selected._id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right-panel tab toggle */}
            <div
              style={{
                display: 'flex',
                gap: 0,
                background: 'var(--clr-bg)',
                borderRadius: 'var(--radius-md)',
                padding: 3,
                border: '1px solid var(--clr-border)',
              }}
            >
              {['events', 'terms'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setRightPanel(tab)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    borderRadius: 'var(--radius-sm)',
                    background:
                      rightPanel === tab ? 'var(--clr-surface)' : 'transparent',
                    border: 'none',
                    fontFamily: 'var(--font-body)',
                    fontWeight: rightPanel === tab ? 600 : 400,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    color:
                      rightPanel === tab
                        ? 'var(--clr-text-1)'
                        : 'var(--clr-text-3)',
                    boxShadow: rightPanel === tab ? 'var(--shadow-xs)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab === 'events'
                    ? `Events (${sortedEvents.length})`
                    : `Terms (${(selected.terms || []).length})`}
                </button>
              ))}
            </div>

            {/* Events list */}
            {rightPanel === 'events' && (
              <div
                className="card"
                style={{
                  maxHeight: 520,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div className="card__header">
                  <span className="card__title">School Events</span>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => openAddEvent()}
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {sortedEvents.length === 0 ? (
                    <div
                      className="empty-state"
                      style={{ padding: '32px 16px' }}
                    >
                      <p className="empty-state__text">
                        No events yet — add holidays, PTAs, sports days…
                      </p>
                    </div>
                  ) : (
                    <>
                      {upcomingEvents.length > 0 && (
                        <div>
                          <div
                            style={{
                              padding: '8px 16px 4px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: 'var(--clr-text-3)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Upcoming
                          </div>
                          {upcomingEvents.map((ev) => (
                            <EventRow
                              key={ev._id}
                              ev={ev}
                              onEdit={() => openEditEvent(ev)}
                              onDelete={() => setDeleteEventTarget(ev._id)}
                            />
                          ))}
                        </div>
                      )}
                      {pastEvents.length > 0 && (
                        <div>
                          <div
                            style={{
                              padding: '8px 16px 4px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: 'var(--clr-text-3)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Past
                          </div>
                          {pastEvents.map((ev) => (
                            <EventRow
                              key={ev._id}
                              ev={ev}
                              onEdit={() => openEditEvent(ev)}
                              onDelete={() => setDeleteEventTarget(ev._id)}
                              past
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Terms list */}
            {rightPanel === 'terms' && (
              <div className="card">
                <div className="card__header">
                  <span className="card__title">Term Dates</span>
                </div>
                <div
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  {(selected.terms || []).length === 0 ? (
                    <p
                      style={{
                        color: 'var(--clr-text-3)',
                        fontSize: '0.875rem',
                        textAlign: 'center',
                      }}
                    >
                      No terms defined — edit the calendar to add terms
                    </p>
                  ) : (
                    selected.terms.map((term, i) => {
                      const colors = ['#d1fae5', '#dbeafe', '#ede9fe'];
                      const texts = ['#065f46', '#1e40af', '#5b21b6'];
                      return (
                        <div
                          key={i}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 'var(--radius-md)',
                            background: colors[i],
                            border: `1px solid ${colors[i]}`,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              color: texts[i],
                              marginBottom: 8,
                            }}
                          >
                            {term.name}
                          </div>
                          {[
                            [
                              'Start – End',
                              `${toInput(term.startDate)} → ${toInput(term.endDate)}`,
                            ],
                            [
                              'Mid-Term Break',
                              term.midTermBreakStart
                                ? `${toInput(term.midTermBreakStart)} → ${toInput(term.midTermBreakEnd)}`
                                : null,
                            ],
                            [
                              'Exams',
                              term.examStartDate
                                ? `${toInput(term.examStartDate)} → ${toInput(term.examEndDate)}`
                                : null,
                            ],
                            [
                              'Next Resumption',
                              term.resumptionDate
                                ? toInput(term.resumptionDate)
                                : null,
                            ],
                          ]
                            .filter(([, v]) => v)
                            .map(([label, value]) => (
                              <div
                                key={label}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  fontSize: '0.8125rem',
                                  marginBottom: 3,
                                }}
                              >
                                <span style={{ color: texts[i], opacity: 0.7 }}>
                                  {label}
                                </span>
                                <span
                                  style={{ fontWeight: 500, color: texts[i] }}
                                >
                                  {value}
                                </span>
                              </div>
                            ))}
                        </div>
                      );
                    })
                  )}
                  <button
                    className="btn btn--secondary btn--sm btn--full"
                    onClick={openEditCal}
                  >
                    <Edit2 size={13} /> Edit Term Dates
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create / Edit Calendar Modal ──────────────────────────── */}
      <Modal
        open={!!calModal}
        onClose={() => setCalModal(null)}
        title={
          calModal === 'create'
            ? 'Create Academic Calendar'
            : `Edit — ${selected?.academicYear}`
        }
        maxWidth={700}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setCalModal(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              disabled={savingCal}
              onClick={handleCalSave}
            >
              {savingCal ? 'Saving...' : 'Save Calendar'}
            </button>
          </>
        }
      >
        <form onSubmit={handleCalSave}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 14,
              marginBottom: 20,
            }}
          >
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Academic Year *</label>

              <select
                className="form-control"
                required
                value={calForm.academicYear}
                onChange={(e) =>
                  setCalForm((f) => ({ ...f, academicYear: e.target.value }))
                }
              >
                {academicYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Session Start *</label>
              <input
                type="date"
                className="form-control"
                required
                value={calForm.sessionStartDate}
                onChange={(e) =>
                  setCalForm((f) => ({
                    ...f,
                    sessionStartDate: e.target.value,
                  }))
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Session End *</label>
              <input
                type="date"
                className="form-control"
                required
                value={calForm.sessionEndDate}
                onChange={(e) =>
                  setCalForm((f) => ({ ...f, sessionEndDate: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Term date rows */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: '0.9375rem',
                marginBottom: 12,
                color: 'var(--clr-text-1)',
              }}
            >
              Term Dates
            </div>
            {calForm.terms.map((term, i) => {
              const colors = ['#d1fae5', '#dbeafe', '#ede9fe'];
              const labels = ['First Term', 'Second Term', 'Third Term'];
              return (
                <div
                  key={i}
                  style={{
                    padding: '12px 14px',
                    background: colors[i],
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      marginBottom: 10,
                    }}
                  >
                    {labels[i]}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                    }}
                  >
                    {[
                      ['startDate', 'Term Start *'],
                      ['endDate', 'Term End *'],
                      ['midTermBreakStart', 'Mid-Term Break Start'],
                      ['midTermBreakEnd', 'Mid-Term Break End'],
                      ['examStartDate', 'Exam Start'],
                      ['examEndDate', 'Exam End'],
                      ['resumptionDate', 'Next Resumption'],
                    ].map(([field, label]) => (
                      <div
                        className="form-group"
                        key={field}
                        style={{ marginBottom: 0 }}
                      >
                        <label style={{ fontSize: '0.8rem' }}>{label}</label>
                        <input
                          type="date"
                          className="form-control"
                          style={{ padding: '6px 10px', fontSize: '0.875rem' }}
                          value={term[field] || ''}
                          required={
                            field === 'startDate' || field === 'endDate'
                          }
                          onChange={(e) =>
                            setTermField(i, field, e.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Notes</label>
            <input
              className="form-control"
              placeholder="Any notes about this academic year..."
              value={calForm.notes}
              onChange={(e) =>
                setCalForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
        </form>
      </Modal>

      {/* ── Add / Edit Event Modal ────────────────────────────────── */}
      <Modal
        open={!!eventModal}
        onClose={() => setEventModal(null)}
        title={eventModal === 'create' ? 'Add Event' : 'Edit Event'}
        maxWidth={480}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setEventModal(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              disabled={savingEvent}
              onClick={handleEventSave}
            >
              {savingEvent ? 'Saving...' : 'Save Event'}
            </button>
          </>
        }
      >
        <form onSubmit={handleEventSave}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Title *</label>
              <input
                className="form-control"
                required
                value={eventForm.title}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g. Independence Day, PTA Meeting..."
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Type</label>
                <select
                  className="form-control"
                  value={eventForm.type}
                  onChange={(e) =>
                    setEventForm((f) => ({
                      ...f,
                      type: e.target.value,
                      color: EVENT_COLORS[e.target.value] || '',
                    }))
                  }
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Color</label>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    marginTop: 4,
                  }}
                >
                  {Object.values(EVENT_COLORS)
                    .filter((c, i, a) => a.indexOf(c) === i)
                    .map((c) => (
                      <div
                        key={c}
                        onClick={() =>
                          setEventForm((f) => ({ ...f, color: c }))
                        }
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: c,
                          cursor: 'pointer',
                          border: `2.5px solid ${eventForm.color === c ? '#1e293b' : 'transparent'}`,
                          transition: 'border 0.1s',
                        }}
                      />
                    ))}
                </div>
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Start Date *</label>
                <input
                  type="date"
                  className="form-control"
                  required
                  value={eventForm.startDate}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>End Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={eventForm.endDate}
                  min={eventForm.startDate}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Target Audience</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['All', 'Admin', 'Teacher', 'Student', 'Parent'].map((a) => {
                  const active = (eventForm.targetAudience || []).includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() =>
                        setEventForm((f) => ({
                          ...f,
                          targetAudience: active
                            ? f.targetAudience.filter((x) => x !== a)
                            : [...(f.targetAudience || []), a],
                        }))
                      }
                      style={{
                        padding: '4px 12px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.8125rem',
                        fontFamily: 'var(--font-body)',
                        cursor: 'pointer',
                        border: `1.5px solid ${active ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                        background: active
                          ? 'var(--clr-primary)'
                          : 'transparent',
                        color: active ? '#fff' : 'var(--clr-text-2)',
                      }}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Description (optional)</label>
              <textarea
                className="form-control"
                rows={2}
                value={eventForm.description}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Confirm: delete event */}
      <ConfirmDialog
        open={!!deleteEventTarget}
        onClose={() => setDeleteEventTarget(null)}
        onConfirm={handleDeleteEvent}
        title="Delete Event"
        message="This event will be permanently removed from the calendar."
        confirmLabel="Delete"
        danger
      />

      {/* Confirm: delete calendar */}
      <ConfirmDialog
        open={!!deleteCalTarget}
        onClose={() => setDeleteCalTarget(null)}
        onConfirm={handleDeleteCal}
        title="Delete Calendar"
        message="This will permanently delete the entire academic calendar and all its events. This cannot be undone."
        confirmLabel="Delete Calendar"
        danger
        loading={deletingCal}
      />
    </>
  );
}

// ── Small event row component used in the right panel ─────────────────────────
function EventRow({ ev, onEdit, onDelete, past = false }) {
  const color = ev.color || EVENT_COLORS[ev.type] || '#6B7280';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 16px',
        borderBottom: '1px solid var(--clr-border)',
        opacity: past ? 0.6 : 1,
      }}
    >
      <div
        style={{
          width: 4,
          alignSelf: 'stretch',
          borderRadius: 2,
          background: color,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: '0.875rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {ev.title}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)' }}>
          {format(new Date(ev.startDate), 'dd MMM yyyy')}
          {ev.endDate &&
            !isSameDay(new Date(ev.startDate), new Date(ev.endDate)) &&
            ` → ${format(new Date(ev.endDate), 'dd MMM')}`}
          {' · '}
          {ev.type}
        </div>
      </div>
      <button className="btn btn--ghost btn--sm btn--icon" onClick={onEdit}>
        <Edit2 size={12} />
      </button>
      <button
        className="btn btn--ghost btn--sm btn--icon"
        style={{ color: 'var(--clr-danger)' }}
        onClick={onDelete}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// function isSameDay(a, b) {
//   return (
//     a.getFullYear() === b.getFullYear() &&
//     a.getMonth() === b.getMonth() &&
//     a.getDate() === b.getDate()
//   );
// }
