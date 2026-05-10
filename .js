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
import './TimetableView.css'; // Import the new styles

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
];

function subjectColor(subjectIdOrName) {
  if (!subjectIdOrName) return SUBJECT_COLORS[0];
  const str = String(subjectIdOrName);
  const hash = str.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

function shortDay(day) {
  return day.slice(0, 3);
}

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
  return map[new Date().getDay()] || 'Monday';
}

function PeriodCell({ period, compact = false }) {
  const minHeight = compact ? 48 : 72;

  if (!period)
    return <div className="tt-cell tt-cell--empty" style={{ minHeight }} />;

  if (period.isBreak) {
    return (
      <div className="tt-cell tt-cell--break" style={{ minHeight }}>
        <span className="tt-label-p" style={{ letterSpacing: '0.05em' }}>
          {period.breakLabel || 'Break'}
        </span>
        {!compact && (
          <span className="tt-label-time">
            {period.startTime}–{period.endTime}
          </span>
        )}
      </div>
    );
  }

  const clr = subjectColor(period.subject?._id || period.subject?.name);
  const teacherName = period.teacher
    ? `${period.teacher.firstName} ${period.teacher.lastName}`
    : null;

  return (
    <div
      className="tt-cell"
      style={{
        minHeight,
        backgroundColor: clr.bg,
        borderColor: clr.border,
        padding: compact ? '4px 6px' : '6px 8px',
      }}
    >
      <div
        className="tt-subject-name"
        style={{ color: clr.text, fontSize: compact ? '0.7rem' : '0.8125rem' }}
      >
        {period.subject?.name || '—'}
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
            <div className="tt-meta-item" style={{ color: clr.text }}>
              <User size={9} /> <span className="ellipsis">{teacherName}</span>
            </div>
          )}
          {period.room && (
            <div className="tt-meta-item" style={{ color: clr.text }}>
              <MapPin size={9} /> <span>{period.room}</span>
            </div>
          )}
          <div
            className="tt-meta-item"
            style={{ color: clr.text, opacity: 0.7 }}
          >
            <Clock size={9} />{' '}
            <span>
              {period.startTime}–{period.endTime}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [activeTT, setActiveTT] = useState(0);

  const timetable = timetables[activeTT] || null;

  const schedule = useMemo(() => {
    const map = {};
    DAYS.forEach((d) => (map[d] = []));
    if (!timetable) return map;
    (timetable.periods || []).forEach((p) => {
      if (map[p.day]) map[p.day].push(p);
    });
    DAYS.forEach((d) => map[d].sort((a, b) => a.periodNumber - b.periodNumber));
    return map;
  }, [timetable]);

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
      <div className="tt-card">
        <div className="tt-header">
          <span className="card__title">{title}</span>
        </div>
        <div className="empty-state" style={{ padding: '40px 24px' }}>
          <Calendar size={36} className="empty-state__icon" />
          <p className="empty-state__title">No timetable published</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tt-card">
      <div className="tt-header">
        <div className="tt-title-group">
          <span className="card__title">{title}</span>
          {timetables.length > 1 && (
            <div className="tt-controls">
              {timetables.map((tt, i) => (
                <button
                  key={tt._id}
                  onClick={() => setActiveTT(i)}
                  className={`tt-btn tt-btn-pill ${i === activeTT ? 'tt-btn--active' : ''}`}
                >
                  {tt.class?.name || `Class ${i + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="tt-controls">
          {['day', 'week'].map((v) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`tt-btn ${viewMode === v ? 'tt-btn--active' : ''}`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div
        className="card__body"
        style={{ padding: compact ? '12px' : '16px' }}
      >
        {viewMode === 'day' && (
          <>
            {showDayNav && (
              <div className="tt-day-nav">
                <button
                  className="tt-nav-arrow"
                  onClick={() => setActiveDay(DAYS[activeDayIdx - 1])}
                  disabled={!hasPrev}
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="tt-day-tabs">
                  {DAYS.map((day) => (
                    <button
                      key={day}
                      onClick={() => setActiveDay(day)}
                      className={`tt-day-tab ${day === activeDay ? 'tt-day-tab--active' : ''} ${day === today ? 'tt-day-tab--today' : ''}`}
                    >
                      {shortDay(day)}
                      {(schedule[day] || []).length > 0 &&
                        day !== activeDay && <span className="tt-dot" />}
                    </button>
                  ))}
                </div>
                <button
                  className="tt-nav-arrow"
                  onClick={() => setActiveDay(DAYS[activeDayIdx + 1])}
                  disabled={!hasNext}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <div className="day-view-container">
              {(schedule[activeDay] || []).map((p) => (
                <div
                  key={p._id || `${p.day}-${p.periodNumber}`}
                  className="tt-period-row"
                >
                  <div className="tt-time-col">
                    <span className="tt-label-p">
                      {p.isBreak ? '' : `P${p.periodNumber}`}
                    </span>
                    {!compact && (
                      <span className="tt-label-time">{p.startTime}</span>
                    )}
                  </div>
                  <PeriodCell period={p} compact={compact} />
                </div>
              ))}
            </div>
          </>
        )}

        {viewMode === 'week' && (
          <div className="tt-table-container">
            <table className="tt-table">
              <thead>
                <tr>
                  <th className="tt-th" style={{ width: 36 }}>
                    P#
                  </th>
                  {DAYS.map((day) => (
                    <th
                      key={day}
                      className="tt-th"
                      style={{
                        color: day === today ? 'var(--clr-primary)' : '',
                      }}
                    >
                      {shortDay(day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPeriodNumbers.map((pNum) => (
                  <tr key={pNum}>
                    <td style={{ textAlign: 'center', paddingRight: 4 }}>
                      <span className="tt-label-p">P{pNum}</span>
                    </td>
                    {DAYS.map((day) => {
                      const p = (schedule[day] || []).find(
                        (period) => period.periodNumber === pNum,
                      );
                      return (
                        <td key={day} style={{ verticalAlign: 'top' }}>
                          <PeriodCell period={p} compact />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
