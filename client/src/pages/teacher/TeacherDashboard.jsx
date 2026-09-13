import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Users,
  BookOpen,
  CheckSquare,
  Bell,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { dashboardService } from '../../services/api';
import { format, isValid, isPast, differenceInCalendarDays } from 'date-fns';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a time-appropriate greeting */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Safely format a date string — returns fallback if invalid */
function safeFormat(dateStr, fmt, fallback = '—') {
  try {
    const d = new Date(dateStr);
    return isValid(d) ? format(d, fmt) : fallback;
  } catch {
    return fallback;
  }
}

/** Extract an array from any shape the API can return */
function extractArray(responseData, key) {
  if (!responseData) return [];
  if (Array.isArray(responseData)) return responseData;
  if (Array.isArray(responseData[key])) return responseData[key];
  return [];
}

// Segment order is fixed and meaningful — best outcome to worst, left to
// right — so the bar reads the same way on every teacher's screen.
/**
 * "In 3 days" rather than "14 Sep 2026".
 *
 * A teacher scanning this table wants to know what is about to bite, and
 * working that out from a date means doing arithmetic against today for every
 * row. The exact date stays underneath for anyone who needs it.
 */
function dueLabel(dateStr) {
  const d = dateStr ? new Date(dateStr) : null;
  if (!d || !isValid(d)) return { text: '—', urgent: false, past: false };

  const days = differenceInCalendarDays(d, new Date());

  if (days < 0) {
    return {
      text: days === -1 ? 'Yesterday' : `${Math.abs(days)} days ago`,
      urgent: false,
      past: true,
    };
  }
  if (days === 0) return { text: 'Today', urgent: true, past: false };
  if (days === 1) return { text: 'Tomorrow', urgent: true, past: false };
  if (days <= 7) return { text: `In ${days} days`, urgent: false, past: false };

  return { text: format(d, 'dd MMM'), urgent: false, past: false };
}

const ATTENDANCE_ORDER = ['Present', 'Late', 'Excused', 'Absent'];

// Excused was #6B7280. A grey segment sat directly against the grey unfilled
// track and read as the same thing, so an authorised absence looked like a
// student nobody had marked yet. Blue is the portal's own info tone and keeps
// all four fills above the chroma floor.
const ATTENDANCE_COLORS = {
  Present: '#10B981',
  Late: '#F59E0B',
  Excused: '#3B82F6',
  Absent: '#EF4444',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function TeacherDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    dashboardService
      .getTeacher()
      .then((r) => {
        // Support both sendSuccess ({ data: { ... } }) and any wrapper
        const payload = r?.data?.data ?? r?.data ?? null;
        setData(payload);
      })
      .catch((err) => {
        const msg = err?.response?.data?.message || 'Failed to load dashboard';
        toast.error(msg);
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 16,
        }}
      >
        <div className="spinner" />
        <span style={{ color: 'var(--clr-text-3)', fontSize: '0.9rem' }}>
          Loading your dashboard...
        </span>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="card">
        <div className="empty-state" style={{ padding: '60px 24px' }}>
          <AlertTriangle
            size={44}
            className="empty-state__icon"
            style={{ color: 'var(--clr-danger)' }}
          />
          <p className="empty-state__title">Dashboard unavailable</p>
          <p className="empty-state__text">{error}</p>
          <button
            className="btn btn--primary btn--sm"
            style={{ marginTop: 8 }}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Safe data extraction ─────────────────────────────────────────────────
  const teacher = data?.teacher || {};
  const stats = data?.stats || {};
  const assignments = extractArray(data?.assignments, 'assignments');
  const announcements = extractArray(data?.announcements, 'announcements');

  // todayAttendance may be an object or null from the backend
  const todayAttendance =
    data?.todayAttendance && typeof data.todayAttendance === 'object'
      ? data.todayAttendance
      : { Present: 0, Absent: 0, Late: 0 };

  const firstName =
    teacher.firstName || teacher.fullName?.split(' ')[0] || 'Teacher';
  const className = teacher.classTeacher?.name;
  const mySubjects = Array.isArray(teacher.subjects) ? teacher.subjects : [];

  const counts = ATTENDANCE_ORDER.reduce(
    (acc, status) => ({
      ...acc,
      [status]: Number(todayAttendance[status]) || 0,
    }),
    {},
  );

  const marked = ATTENDANCE_ORDER.reduce((sum, s) => sum + counts[s], 0);
  const presentCount = counts.Present;

  // The class roster, which is what every percentage on this card divides by.
  // It can legitimately fall short of `marked` — a student marked this morning
  // and withdrawn this afternoon leaves a register row with no roster place —
  // so the wider of the two is the denominator, and the bar can never overflow
  // its track.
  const rosterSize = Math.max(Number(stats.totalStudentsInClass) || 0, marked);
  const unmarked = Math.max(0, rosterSize - marked);

  // Rounded, for anything a human reads.
  const rosterPct = (count) =>
    rosterSize > 0 ? Math.round((count / rosterSize) * 100) : 0;

  // Unrounded, for the bar itself. Four independently rounded segments can
  // each round up — a class of six split 1/1/1/3 summed to 101% — and since
  // the track clips its overflow, the rounding error was silently eaten off
  // the end of the Absent segment. Exact fractions always total 100.
  const rosterFraction = (count) =>
    rosterSize > 0 ? (count / rosterSize) * 100 : 0;

  const presentRate = rosterPct(presentCount);

  // ── Stat cards config ────────────────────────────────────────────────────
  const statCards = [
    {
      label: 'My Class',
      value: className || '—',
      sub: className
        ? `${stats.totalStudentsInClass || 0} students`
        : 'No class assigned',
      icon: Users,
      color: '#0891B2',
      to: className ? '/teacher/attendance' : null,
    },
    {
      label: 'Total Assignments',
      value: stats.totalAssignments ?? 0,
      sub: `${stats.upcomingAssignments ?? 0} active`,
      icon: ClipboardList,
      color: '#1A4FAB',
      to: '/teacher/assignments',
    },
    {
      label: 'Pending Grades',
      value: stats.pendingGrades ?? 0,
      sub:
        stats.pendingGrades > 0
          ? `${stats.pendingGrades} to mark`
          : 'All graded ✓',
      icon: BookOpen,
      color: stats.pendingGrades > 0 ? '#F59E0B' : '#10B981',
      to: '/teacher/grades',
    },
    {
      label: 'Today Present',
      value: rosterSize > 0 ? `${presentCount}/${rosterSize}` : presentCount,
      sub:
        marked === 0
          ? 'Not marked yet'
          : unmarked > 0
            ? `${unmarked} still to mark`
            : `${presentRate}% attendance`,
      icon: CheckSquare,
      color: '#10B981',
      to: '/teacher/attendance',
    },
  ];

  // ────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">
            {getGreeting()}, {firstName}!
          </h1>
          <p className="page-header__subtitle">
            {className
              ? `Class ${className} · ${format(new Date(), 'EEEE, dd MMMM yyyy')}`
              : format(new Date(), 'EEEE, dd MMMM yyyy')}
          </p>
        </div>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────── */}
      <div className="stats-grid">
        {/* .stat-card already lifts on hover, which promised a click that
            never happened. Now the ones with somewhere to go actually take you
            there, by mouse or by keyboard. */}
        {statCards.map((s) => (
          <div
            key={s.label}
            className="stat-card"
            style={{
              '--accent-color': s.color,
              cursor: s.to ? 'pointer' : 'default',
            }}
            role={s.to ? 'button' : undefined}
            tabIndex={s.to ? 0 : undefined}
            onClick={s.to ? () => navigate(s.to) : undefined}
            onKeyDown={
              s.to
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(s.to);
                    }
                  }
                : undefined
            }
          >
            <div className="stat-card__icon">
              <s.icon size={22} />
            </div>
            <div className="stat-card__content">
              <div className="stat-card__label">{s.label}</div>
              {/* Truncate long class names gracefully */}
              <div
                className="stat-card__value"
                style={{
                  fontSize: String(s.value).length > 6 ? '1.25rem' : '1.875rem',
                  wordBreak: 'break-word',
                }}
              >
                {s.value}
              </div>
              <div className="stat-card__meta">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Subjects taught strip ─────────────────────────────────────── */}
      {mySubjects.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 24,
          }}
        >
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--clr-text-3)',
              alignSelf: 'center',
              marginRight: 4,
            }}
          >
            Subjects:
          </span>
          {mySubjects.map((s) => (
            <span
              key={s._id || s}
              className="badge badge--info"
              style={{ fontSize: '0.8125rem' }}
            >
              {s.name}{' '}
              {s.code && <span style={{ opacity: 0.7 }}>({s.code})</span>}
            </span>
          ))}
        </div>
      )}

      {/* ── Main grid ─────────────────────────────────────────────────── */}
      <div className="dashboard-grid">
        {/* ── Assignments table ──────────────────────────────────────── */}
        <div className="card">
          <div className="card__header">
            <span className="card__title">Assignments</span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => navigate('/teacher/assignments')}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Manage <ChevronRight size={14} />
            </button>
          </div>
          <div
            className="table-wrapper"
            style={{ border: 'none', borderRadius: 0 }}
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Subject</th>
                  <th>Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        textAlign: 'center',
                        padding: '32px 16px',
                        color: 'var(--clr-text-3)',
                      }}
                    >
                      No assignments yet
                    </td>
                  </tr>
                ) : (
                  assignments.map((a) => {
                    const overdue = a.dueDate
                      ? isPast(new Date(a.dueDate))
                      : false;
                    const due = dueLabel(a.dueDate);
                    return (
                      <tr key={a._id}>
                        <td style={{ fontWeight: 500 }}>{a.title}</td>
                        <td
                          style={{
                            color: 'var(--clr-text-2)',
                            fontSize: '0.875rem',
                          }}
                        >
                          {a.subject?.name || '—'}
                        </td>
                        <td style={{ fontSize: '0.875rem' }}>
                          <div
                            style={{
                              color: overdue
                                ? 'var(--clr-danger)'
                                : due.urgent
                                  ? 'var(--clr-warning)'
                                  : 'var(--clr-text-2)',
                              fontWeight: overdue || due.urgent ? 600 : 400,
                            }}
                          >
                            {due.text}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--clr-text-3)',
                              marginTop: 1,
                            }}
                          >
                            {safeFormat(a.dueDate, 'dd MMM yyyy')}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge badge--${overdue ? 'danger' : 'success'}`}
                          >
                            {overdue ? 'Closed' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {stats.totalAssignments > 10 && (
            <div className="card__footer" style={{ textAlign: 'center' }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => navigate('/teacher/assignments')}
              >
                View all {stats.totalAssignments} assignments
              </button>
            </div>
          )}
        </div>

        {/* ── Right column ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* ── Today's attendance ──────────────────────────────────── */}
          <div className="card">
            <div className="card__header">
              <span className="card__title">Today's Attendance</span>
              {className && (
                <span
                  style={{ fontSize: '0.8125rem', color: 'var(--clr-text-3)' }}
                >
                  {className}
                </span>
              )}
            </div>

            {/* card__body, not a bare div. Without it the bars, labels and the
                full-width button sat flush against the card border — .card
                carries no padding of its own, it is card__body that supplies
                it, which is why every other card on this page has one. */}
            <div className="card__body">
              {!className ? (
                <p
                  style={{
                    color: 'var(--clr-text-3)',
                    fontSize: '0.875rem',
                    textAlign: 'center',
                    padding: '12px 0',
                  }}
                >
                  You are not assigned as a class teacher
                </p>
              ) : (
                <>
                  {/* Present against the ROSTER, not against however many rows
                      happen to exist. The percentages used to divide by the
                      number of marked students, so a teacher who had ticked
                      three present and stopped saw "100% attendance" for a
                      class of thirty. The roster is the only honest
                      denominator. */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '2.25rem',
                        fontWeight: 700,
                        lineHeight: 1,
                        color: 'var(--clr-text-1)',
                      }}
                    >
                      {presentCount}
                    </span>
                    <span
                      style={{
                        fontSize: '0.9375rem',
                        color: 'var(--clr-text-3)',
                      }}
                    >
                      of {rosterSize || '—'} present
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--clr-text-3)',
                      margin: '0 0 14px',
                    }}
                  >
                    {marked === 0
                      ? 'Register not taken yet'
                      : unmarked > 0
                        ? `${presentRate}% so far · ${unmarked} still to mark`
                        : `${presentRate}% attendance · register complete`}
                  </p>

                  {/* Part-to-whole across the whole class. The track's unfilled
                      remainder IS the unmarked students — giving them their own
                      grey segment would sit next to the grey track and read as
                      the same thing. */}
                  <div
                    style={{
                      display: 'flex',
                      height: 12,
                      borderRadius: 6,
                      background: 'var(--clr-bg-alt)',
                      overflow: 'hidden',
                      marginBottom: 14,
                    }}
                    role="img"
                    aria-label={ATTENDANCE_ORDER.map(
                      (s) => `${s} ${counts[s]}`,
                    ).join(', ')}
                  >
                    {ATTENDANCE_ORDER.map((status, i) => {
                      const pct = rosterFraction(counts[status]);
                      if (pct <= 0) return null;
                      return (
                        <div
                          key={status}
                          title={`${status}: ${counts[status]}`}
                          style={{
                            width: `${pct}%`,
                            background: ATTENDANCE_COLORS[status],
                            // 2px of surface between touching segments, so two
                            // adjacent fills never read as one longer one.
                            borderRight:
                              i < ATTENDANCE_ORDER.length - 1
                                ? '2px solid var(--clr-surface)'
                                : 'none',
                            boxSizing: 'border-box',
                            transition: 'width 0.6s ease',
                          }}
                        />
                      );
                    })}
                  </div>

                  {/* The legend carries the count, so identity is never colour
                      alone — the green and amber fills both sit under 3:1
                      against white and cannot be asked to speak by
                      themselves. */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: '8px 12px',
                      marginBottom: 16,
                    }}
                  >
                    {ATTENDANCE_ORDER.map((status) => (
                      <div
                        key={status}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: 3,
                            background: ATTENDANCE_COLORS[status],
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '0.8125rem',
                            color: 'var(--clr-text-2)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {status}
                        </span>
                        <span
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            color: 'var(--clr-text-1)',
                            marginLeft: 'auto',
                          }}
                        >
                          {counts[status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <button
                className="btn btn--primary btn--full"
                onClick={() => navigate('/teacher/attendance')}
              >
                {marked === 0 ? 'Mark Attendance' : 'Update Register'}
              </button>
            </div>
          </div>

          {/* ── Recent announcements ─────────────────────────────────── */}
          {announcements.length > 0 && (
            <div className="card">
              <div className="card__header">
                <span className="card__title">Announcements</span>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => navigate('/teacher/announcements')}
                >
                  View all
                </button>
              </div>
              <div
                className="card__body"
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                {announcements.map((ann) => (
                  <div
                    key={ann._id}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        flexShrink: 0,
                        background:
                          ann.priority === 'Urgent'
                            ? '#fee2e2'
                            : 'var(--clr-bg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Bell
                        size={14}
                        color={
                          ann.priority === 'Urgent'
                            ? '#ef4444'
                            : 'var(--clr-primary)'
                        }
                      />
                    </div>
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
                        {ann.title}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--clr-text-3)',
                          marginTop: 2,
                        }}
                      >
                        {ann.publishedAt
                          ? safeFormat(ann.publishedAt, 'dd MMM yyyy')
                          : 'Draft'}
                      </div>
                    </div>
                    {ann.priority && ann.priority !== 'Normal' && (
                      <span
                        className={`badge badge--${ann.priority === 'Urgent' ? 'danger' : 'warning'}`}
                        style={{ fontSize: '0.7rem', flexShrink: 0 }}
                      >
                        {ann.priority}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
