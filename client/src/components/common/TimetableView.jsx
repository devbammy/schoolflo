import React, { useState, useMemo } from 'react';
import {
  Clock,
  BookOpen,
  MapPin,
  User,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const SUBJECT_COLORS = [
  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  { bg: '#e0f2fe', text: '#0c4a6e', border: '#7dd3fc' },
  { bg: '#f0fdf4', text: '#14532d', border: '#86efac' },
  { bg: '#fdf4ff', text: '#701a75', border: '#e879f9' },
  { bg: '#fff7ed', text: '#7c2d12', border: '#fb923c' },
];

/** Deterministic color from subject ID or name */
function subjectColor(subjectIdOrName) {
  if (!subjectIdOrName) return SUBJECT_COLORS[0];
  const str = String(subjectIdOrName);
  const hash = str.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

/** Returns "Mon" style short day */
function shortDay(day) {
  return day.slice(0, 3);
}

/** Returns the current day of week (Monday–Saturday), default Monday */
function todayDayName() {
  const map = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const idx = new Date().getDay();
  return map[idx] || 'Monday';
}

// ── Period Cell ───────────────────────────────────────────────────────────────
function PeriodCell({ period, compact = false }) {
  if (!period) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: compact ? 48 : 72,
          border: '1px dashed var(--clr-border)',
          borderRadius: 6,
          background: 'transparent',
        }}
      />
    );
  }

  if (period.isBreak) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: compact ? 48 : 72,
          borderRadius: 6,
          background: '#f8fafc',
          border: '1px solid var(--clr-border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          padding: '4px 6px',
        }}
      >
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: 'var(--clr-text-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {period.breakLabel || 'Break'}
        </span>
        {!compact && (
          <span style={{ fontSize: '0.7rem', color: 'var(--clr-text-3)' }}>
            {period.startTime}–{period.endTime}
          </span>
        )}
      </div>
    );
  }

  const subjectName = period.subject?.name || '—';
  const teacherName = period.teacher
    ? `${period.teacher.firstName} ${period.teacher.lastName}`
    : null;
  const clr = subjectColor(period.subject?._id || subjectName);

  return (
    <div
      style={{
        flex: 1,
        minHeight: compact ? 48 : 72,
        borderRadius: 6,
        background: clr.bg,
        border: `1px solid ${clr.border}`,
        padding: compact ? '4px 6px' : '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
      {/* Subject name */}
      <div
        style={{
          fontWeight: 700,
          fontSize: compact ? '0.7rem' : '0.8125rem',
          color: clr.text,
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {subjectName}
      </div>

      {!compact && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            marginTop: 4,
          }}
        >
          {teacherName && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                fontSize: '0.7rem',
                color: clr.text,
                opacity: 0.8,
              }}
            >
              <User size={9} />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {teacherName}
              </span>
            </div>
          )}
          {period.room && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                fontSize: '0.7rem',
                color: clr.text,
                opacity: 0.8,
              }}
            >
              <MapPin size={9} />
              <span>{period.room}</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: '0.7rem',
              color: clr.text,
              opacity: 0.7,
            }}
          >
            <Clock size={9} />
            <span>
              {period.startTime}–{period.endTime}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Day View (single day, all periods) ────────────────────────────────────────
function DayView({ periods, compact = false }) {
  if (!periods || periods.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '28px 16px',
        }}
      >
        <p style={{ color: 'var(--clr-text-3)', fontSize: '0.875rem' }}>
          No classes scheduled
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {periods.map((period) => (
        <div
          key={period._id || `${period.day}-${period.periodNumber}`}
          style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}
        >
          {/* Period number + time label */}
          <div
            style={{
              width: 44,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <span
              style={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: 'var(--clr-text-3)',
                textTransform: 'uppercase',
              }}
            >
              {period.isBreak ? '' : `P${period.periodNumber}`}
            </span>
            {!compact && (
              <span
                style={{
                  fontSize: '0.6rem',
                  color: 'var(--clr-text-3)',
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {period.startTime}
              </span>
            )}
          </div>
          <PeriodCell period={period} compact={compact} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main TimetableView component
// Props:
//   timetables  – array from the API
//   title       – card title override
//   compact     – smaller cells (dashboard widgets)
//   showDayNav  – show day navigation arrows (default true)
//   defaultView – 'day' | 'week' (default 'day')
//   highlightTeacherId – highlight periods belonging to this teacher
// ─────────────────────────────────────────────────────────────────────────────
export default function TimetableView({
  timetables = [],
  title = 'Timetable',
  compact = false,
  showDayNav = true,
  defaultView = 'day',
  highlightTeacherId = null,
}) {
  const today = todayDayName();
  const [activeDay, setActiveDay] = useState(today);
  const [viewMode, setViewMode] = useState(defaultView);
  const [activeTT, setActiveTT] = useState(0); // index into timetables array

  const timetable = timetables[activeTT] || null;

  // Build a schedule map: { Monday: [...periods], Tuesday: [...], ... }
  const schedule = useMemo(() => {
    if (!timetable) return {};
    const map = {};
    DAYS.forEach((d) => {
      map[d] = [];
    });
    (timetable.periods || []).forEach((p) => {
      if (map[p.day]) map[p.day].push(p);
    });
    DAYS.forEach((d) => {
      map[d].sort((a, b) => a.periodNumber - b.periodNumber);
    });
    return map;
  }, [timetable]);

  // Unique period numbers across all days (for week column headers)
  const allPeriodNumbers = useMemo(() => {
    const nums = new Set();
    (timetable?.periods || []).forEach((p) => {
      if (!p.isBreak) nums.add(p.periodNumber);
    });
    return Array.from(nums).sort((a, b) => a - b);
  }, [timetable]);

  const activeDayIdx = DAYS.indexOf(activeDay);
  const hasPrev = activeDayIdx > 0;
  const hasNext = activeDayIdx < DAYS.length - 1;

  if (!timetables.length) {
    return (
      <div className="card">
        <div className="card__header">
          <span className="card__title">{title}</span>
        </div>
        <div className="empty-state" style={{ padding: '40px 24px' }}>
          <Calendar size={36} className="empty-state__icon" />
          <p className="empty-state__title">No timetable published</p>
          <p className="empty-state__text">
            The timetable hasn't been published yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* ── Card header ───────────────────────────────────────────────── */}
      <div className="card__header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flex: 1,
            flexWrap: 'wrap',
          }}
        >
          <span className="card__title">{title}</span>
          {/* Class switcher (Parents with multiple children) */}
          {timetables.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {timetables.map((tt, i) => (
                <button
                  key={tt._id}
                  onClick={() => setActiveTT(i)}
                  style={{
                    padding: '2px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: `1.5px solid ${i === activeTT ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                    background:
                      i === activeTT ? 'var(--clr-primary)' : 'transparent',
                    color: i === activeTT ? '#fff' : 'var(--clr-text-2)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {tt.class?.name || `Class ${i + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {['day', 'week'].map((v) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                border: `1.5px solid ${viewMode === v ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                background:
                  viewMode === v ? 'var(--clr-primary)' : 'transparent',
                color: viewMode === v ? '#fff' : 'var(--clr-text-2)',
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div style={{ padding: compact ? '12px' : '16px' }}>
        {/* ── DAY VIEW ──────────────────────────────────────────────── */}
        {viewMode === 'day' && (
          <>
            {/* Day navigation */}
            {showDayNav && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
              >
                <button
                  onClick={() => setActiveDay(DAYS[activeDayIdx - 1])}
                  disabled={!hasPrev}
                  style={{
                    padding: '4px 8px',
                    background: 'none',
                    border: '1px solid var(--clr-border)',
                    borderRadius: 6,
                    cursor: hasPrev ? 'pointer' : 'not-allowed',
                    opacity: hasPrev ? 1 : 0.35,
                  }}
                >
                  <ChevronLeft size={16} />
                </button>

                {/* Day tabs */}
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                  }}
                >
                  {DAYS.map((day) => {
                    const isToday = day === today;
                    const isActive = day === activeDay;
                    const hasPeriods = (schedule[day] || []).length > 0;
                    return (
                      <button
                        key={day}
                        onClick={() => setActiveDay(day)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-body)',
                          border: `1.5px solid ${isActive ? 'var(--clr-primary)' : isToday ? 'var(--clr-accent)' : 'var(--clr-border)'}`,
                          background: isActive
                            ? 'var(--clr-primary)'
                            : isToday
                              ? 'var(--clr-accent)' + '22'
                              : 'transparent',
                          color: isActive
                            ? '#fff'
                            : isToday
                              ? 'var(--clr-accent)'
                              : hasPeriods
                                ? 'var(--clr-text-1)'
                                : 'var(--clr-text-3)',
                          position: 'relative',
                        }}
                      >
                        {shortDay(day)}
                        {/* dot indicator if there are classes */}
                        {hasPeriods && !isActive && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: 4,
                              height: 4,
                              borderRadius: '50%',
                              background: 'var(--clr-primary)',
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setActiveDay(DAYS[activeDayIdx + 1])}
                  disabled={!hasNext}
                  style={{
                    padding: '4px 8px',
                    background: 'none',
                    border: '1px solid var(--clr-border)',
                    borderRadius: 6,
                    cursor: hasNext ? 'pointer' : 'not-allowed',
                    opacity: hasNext ? 1 : 0.35,
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* Active day label */}
            <div
              style={{
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  color: 'var(--clr-text-1)',
                }}
              >
                {activeDay}
              </span>
              {activeDay === today && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: 'var(--clr-primary)',
                    color: '#fff',
                    padding: '1px 7px',
                    borderRadius: 4,
                  }}
                >
                  TODAY
                </span>
              )}
              <span
                style={{ fontSize: '0.8125rem', color: 'var(--clr-text-3)' }}
              >
                {(schedule[activeDay] || []).filter((p) => !p.isBreak).length}{' '}
                periods
              </span>
            </div>

            <DayView periods={schedule[activeDay] || []} compact={compact} />
          </>
        )}

        {/* ── WEEK VIEW ─────────────────────────────────────────────── */}
        {viewMode === 'week' && (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 4,
                minWidth: 560,
              }}
            >
              <thead>
                <tr>
                  {/* Period column */}
                  <th
                    style={{
                      width: 36,
                      fontSize: '0.6875rem',
                      color: 'var(--clr-text-3)',
                      fontWeight: 600,
                      textAlign: 'center',
                      paddingBottom: 8,
                    }}
                  >
                    P#
                  </th>
                  {DAYS.map((day) => (
                    <th
                      key={day}
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color:
                          day === today
                            ? 'var(--clr-primary)'
                            : 'var(--clr-text-2)',
                        textAlign: 'center',
                        paddingBottom: 8,
                        minWidth: 90,
                      }}
                    >
                      <span style={{ display: 'block' }}>{shortDay(day)}</span>
                      {day === today && (
                        <span
                          style={{
                            fontSize: '0.6rem',
                            background: 'var(--clr-primary)',
                            color: '#fff',
                            padding: '1px 5px',
                            borderRadius: 4,
                          }}
                        >
                          Today
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPeriodNumbers.map((pNum) => {
                  // Find first period in any day with this number for time reference
                  const samplePeriod = timetable.periods.find(
                    (p) => p.periodNumber === pNum && !p.isBreak,
                  );
                  return (
                    <tr key={pNum}>
                      <td
                        style={{
                          textAlign: 'center',
                          verticalAlign: 'middle',
                          paddingRight: 4,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            P{pNum}
                          </span>
                          {samplePeriod && (
                            <span
                              style={{
                                fontSize: '0.6rem',
                                color: 'var(--clr-text-3)',
                                lineHeight: 1.1,
                              }}
                            >
                              {samplePeriod.startTime}
                            </span>
                          )}
                        </div>
                      </td>
                      {DAYS.map((day) => {
                        const period = (schedule[day] || []).find(
                          (p) => p.periodNumber === pNum,
                        );
                        const isHighlighted =
                          highlightTeacherId &&
                          period?.teacher?._id === highlightTeacherId;
                        return (
                          <td
                            key={day}
                            style={{
                              verticalAlign: 'top',
                              outline: isHighlighted
                                ? '2px solid var(--clr-primary)'
                                : 'none',
                              borderRadius: 6,
                            }}
                          >
                            <PeriodCell period={period || null} compact />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Break rows — inserted between periods if any day has them */}
                {/* (breaks are rendered inline in day view but skipped in week grid for simplicity) */}
              </tbody>
            </table>

            {/* Legend */}
            {highlightTeacherId && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                  fontSize: '0.75rem',
                  color: 'var(--clr-text-3)',
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    border: '2px solid var(--clr-primary)',
                    borderRadius: 2,
                  }}
                />
                Your periods
              </div>
            )}
          </div>
        )}

        {/* ── Class info footer ────────────────────────────────────── */}
        {timetable && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid var(--clr-border)',
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              fontSize: '0.8125rem',
              color: 'var(--clr-text-3)',
            }}
          >
            <span>
              {timetable.class?.name}{' '}
              {timetable.section && `· Section ${timetable.section}`}
            </span>
            <span>
              {timetable.term} · {timetable.academicYear}
            </span>
            {timetable.notes && (
              <span style={{ fontStyle: 'italic' }}>ℹ {timetable.notes}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
