import React, { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Info } from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { calendarService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

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

const TERM_BG = {
  'First Term': { bg: '#d1fae511', border: '#d1fae5' },
  'Second Term': { bg: '#dbeafe11', border: '#dbeafe' },
  'Third Term': { bg: '#ede9fe11', border: '#ede9fe' },
};

function toDisplay(date) {
  if (!date) return '—';
  try {
    return format(new Date(date), 'dd MMM yyyy');
  } catch {
    return '—';
  }
}

function isSameDayFn(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function CalendarViewPage() {
  const { user } = useAuthStore();
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    calendarService
      .getActive()
      .then((r) => {
        const cal = r.data.data?.calendar;
        setCalendar(cal);
        if (cal?.sessionStartDate) setViewMonth(new Date(cal.sessionStartDate));
      })
      .catch(() => toast.error('Failed to load calendar'))
      .finally(() => setLoading(false));
  }, []);

  // ── Month grid days ────────────────────────────────────────────────
  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  // ── Events visible to this user's role ─────────────────────────────
  const visibleEvents = useMemo(() => {
    if (!calendar) return [];
    return (calendar.events || []).filter((ev) => {
      const ta = ev.targetAudience || ['All'];
      return ta.includes('All') || ta.includes(user?.role);
    });
  }, [calendar, user?.role]);

  const eventsForDay = (day) =>
    visibleEvents.filter((ev) => {
      const s = new Date(ev.startDate);
      s.setHours(0, 0, 0, 0);
      const e = new Date(ev.endDate || ev.startDate);
      e.setHours(23, 59, 59, 999);
      return day >= s && day <= e;
    });

  const termForDay = (day) =>
    (calendar?.terms || []).find((t) => {
      if (!t.startDate || !t.endDate) return false;
      return day >= new Date(t.startDate) && day <= new Date(t.endDate);
    });

  // ── Upcoming events (next 60 days) ─────────────────────────────────
  const upcoming = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const horizon = new Date(now.getTime() + 60 * 86400000);
    return visibleEvents
      .filter(
        (ev) =>
          new Date(ev.endDate || ev.startDate) >= now &&
          new Date(ev.startDate) <= horizon,
      )
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [visibleEvents]);

  // ── Current term ───────────────────────────────────────────────────
  const currentTerm = useMemo(() => {
    const now = new Date();
    return (
      (calendar?.terms || []).find(
        (t) =>
          t.startDate &&
          t.endDate &&
          now >= new Date(t.startDate) &&
          now <= new Date(t.endDate),
      ) || null
    );
  }, [calendar]);

  // ── Days until next event ──────────────────────────────────────────
  const nextEvent = upcoming[0] || null;
  const daysUntil = nextEvent
    ? Math.ceil((new Date(nextEvent.startDate) - new Date()) / 86400000)
    : null;

  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );

  if (!calendar)
    return (
      <div className="card">
        <div className="empty-state" style={{ padding: '60px 24px' }}>
          <Calendar size={48} className="empty-state__icon" />
          <p className="empty-state__title">No calendar published yet</p>
          <p className="empty-state__text">
            The school administration hasn't published the academic calendar
            yet.
          </p>
        </div>
      </div>
    );

  return (
    <>
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Academic Calendar</h1>
          <p className="page-header__subtitle">
            {calendar.academicYear} · {toDisplay(calendar.sessionStartDate)} –{' '}
            {toDisplay(calendar.sessionEndDate)}
          </p>
        </div>
      </div>

      {/* ── Info strip ──────────────────────────────────────────────── */}
      <div
        style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}
      >
        {/* Current term */}
        {currentTerm ? (
          <div
            style={{
              padding: '10px 18px',
              background: '#d1fae5',
              border: '1px solid #6ee7b7',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#10B981',
              }}
            />
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#065f46',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Current Term
              </div>
              <div
                style={{
                  fontSize: '0.9375rem',
                  fontWeight: 700,
                  color: '#065f46',
                }}
              >
                {currentTerm.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#047857' }}>
                Ends {toDisplay(currentTerm.endDate)}
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '10px 18px',
              background: 'var(--clr-bg)',
              border: '1px solid var(--clr-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)' }}>
              No active term
            </div>
          </div>
        )}

        {/* Next event */}
        {nextEvent && (
          <div
            style={{
              padding: '10px 18px',
              background: '#eff6ff',
              border: '1px solid #93c5fd',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background:
                  nextEvent.color || EVENT_COLORS[nextEvent.type] || '#6B7280',
              }}
            />
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#1e40af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Next Event{' '}
                {daysUntil === 0
                  ? '(Today!)'
                  : daysUntil === 1
                    ? '(Tomorrow)'
                    : `(in ${daysUntil} days)`}
              </div>
              <div
                style={{
                  fontSize: '0.9375rem',
                  fontWeight: 700,
                  color: '#1e40af',
                }}
              >
                {nextEvent.title}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#1d4ed8' }}>
                {toDisplay(nextEvent.startDate)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="calendar-layout calendar-layout--narrow">
        {/* ── Month calendar grid ──────────────────────────────────── */}
        <div className="card">
          <div className="card__header">
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
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setViewMonth(new Date())}
            >
              Today
            </button>
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
                const today = isToday(day);
                const term = termForDay(day);
                const dayEvs = eventsForDay(day);
                const isSelDay = selectedDay && isSameDayFn(day, selectedDay);
                const termStyle = term ? TERM_BG[term.name] || {} : {};

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() =>
                      setSelectedDay(dayEvs.length > 0 ? day : null)
                    }
                    style={{
                      minHeight: 64,
                      padding: '4px 5px',
                      borderRadius: 6,
                      cursor: dayEvs.length > 0 ? 'pointer' : 'default',
                      background: isSelDay
                        ? 'var(--clr-bg-alt)'
                        : term
                          ? termStyle.bg || 'transparent'
                          : 'transparent',
                      border: `1px solid ${isSelDay ? 'var(--clr-primary)' : today ? 'var(--clr-accent)' : 'var(--clr-border)'}`,
                      opacity: inMonth ? 1 : 0.3,
                    }}
                  >
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
                          fontWeight: today ? 700 : 400,
                          background: today
                            ? 'var(--clr-primary)'
                            : 'transparent',
                          color: today ? '#fff' : 'var(--clr-text-1)',
                        }}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      {dayEvs.slice(0, 2).map((ev) => (
                        <div
                          key={ev._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background:
                                ev.color || EVENT_COLORS[ev.type] || '#6B7280',
                              flexShrink: 0,
                            }}
                          />
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
                      {dayEvs.length > 2 && (
                        <span
                          style={{
                            fontSize: '0.6rem',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          +{dayEvs.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div
              style={{
                display: 'flex',
                gap: 14,
                marginTop: 12,
                flexWrap: 'wrap',
              }}
            >
              {[
                { label: 'First Term', color: '#d1fae5' },
                { label: 'Second Term', color: '#dbeafe' },
                { label: 'Third Term', color: '#ede9fe' },
              ].map((t) => (
                <div
                  key={t.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.75rem',
                    color: 'var(--clr-text-3)',
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: t.color,
                    }}
                  />
                  {t.label}
                </div>
              ))}
            </div>
          </div>

          {/* Selected day detail */}
          {selectedDay && eventsForDay(selectedDay).length > 0 && (
            <div
              style={{
                borderTop: '1px solid var(--clr-border)',
                padding: '12px 16px',
                background: 'var(--clr-bg)',
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 8,
                  fontSize: '0.9375rem',
                }}
              >
                {format(selectedDay, 'EEEE, dd MMMM')}
              </div>
              {eventsForDay(selectedDay).map((ev) => (
                <div
                  key={ev._id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '7px 0',
                    borderBottom: '1px solid var(--clr-border)',
                    alignItems: 'flex-start',
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
                  <div>
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
                      {ev.endDate &&
                        !isSameDayFn(
                          new Date(ev.startDate),
                          new Date(ev.endDate),
                        ) &&
                        ` · Until ${toDisplay(ev.endDate)}`}
                    </div>
                    {ev.description && (
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--clr-text-2)',
                          marginTop: 2,
                        }}
                      >
                        {ev.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right sidebar ────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Upcoming events */}
          <div className="card">
            <div className="card__header">
              <span className="card__title">Upcoming Events</span>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {upcoming.length === 0 ? (
                <div
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    color: 'var(--clr-text-3)',
                    fontSize: '0.875rem',
                  }}
                >
                  No upcoming events in the next 60 days
                </div>
              ) : (
                upcoming.map((ev) => {
                  const color = ev.color || EVENT_COLORS[ev.type] || '#6B7280';
                  const daysAway = Math.ceil(
                    (new Date(ev.startDate) - new Date()) / 86400000,
                  );
                  return (
                    <div
                      key={ev._id}
                      style={{
                        display: 'flex',
                        gap: 10,
                        padding: '10px 16px',
                        borderBottom: '1px solid var(--clr-border)',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          width: 4,
                          alignSelf: 'stretch',
                          minHeight: 36,
                          borderRadius: 2,
                          background: color,
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
                            marginTop: 2,
                          }}
                        >
                          {toDisplay(ev.startDate)}
                          {ev.endDate &&
                            !isSameDayFn(
                              new Date(ev.startDate),
                              new Date(ev.endDate),
                            ) &&
                            ` – ${toDisplay(ev.endDate)}`}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {daysAway === 0 ? (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: '#fff',
                              background: 'var(--clr-primary)',
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            Today
                          </span>
                        ) : daysAway === 1 ? (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: 'var(--clr-warning)',
                            }}
                          >
                            Tomorrow
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            {daysAway}d
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Term schedule */}
          <div className="card">
            <div className="card__header">
              <span className="card__title">Term Schedule</span>
            </div>
            <div
              // className="card__body"
              style={{
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {(calendar.terms || []).length === 0 ? (
                <p
                  style={{
                    color: 'var(--clr-text-3)',
                    fontSize: '0.875rem',
                    textAlign: 'center',
                  }}
                >
                  No term dates defined
                </p>
              ) : (
                (calendar.terms || []).map((term, i) => {
                  const now = new Date();
                  const isCurrentTerm =
                    now >= new Date(term.startDate) &&
                    now <= new Date(term.endDate);
                  const colors = [
                    { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
                    { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
                    { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
                  ];
                  const c = colors[i] || colors[0];
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '10px 12px',
                        background: c.bg,
                        border: `1px solid ${isCurrentTerm ? c.border : 'transparent'}`,
                        borderRadius: 'var(--radius-md)',
                        position: 'relative',
                      }}
                    >
                      {isCurrentTerm && (
                        <span
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 8,
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            background: '#10B981',
                            color: '#fff',
                            padding: '1px 6px',
                            borderRadius: 4,
                          }}
                        >
                          CURRENT
                        </span>
                      )}
                      <div
                        style={{
                          fontWeight: 700,
                          color: c.text,
                          marginBottom: 6,
                        }}
                      >
                        {term.name}
                      </div>
                      {[
                        ['Start', toDisplay(term.startDate)],
                        ['End', toDisplay(term.endDate)],
                        term.midTermBreakStart
                          ? [
                              'Mid-Term',
                              `${toDisplay(term.midTermBreakStart)} – ${toDisplay(term.midTermBreakEnd)}`,
                            ]
                          : null,
                        term.examStartDate
                          ? [
                              'Exams',
                              `${toDisplay(term.examStartDate)} – ${toDisplay(term.examEndDate)}`,
                            ]
                          : null,
                        term.resumptionDate
                          ? ['Next Resumption', toDisplay(term.resumptionDate)]
                          : null,
                      ]
                        .filter(Boolean)
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
                            <span style={{ color: c.text, opacity: 0.7 }}>
                              {label}
                            </span>
                            <span style={{ fontWeight: 500, color: c.text }}>
                              {value}
                            </span>
                          </div>
                        ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
