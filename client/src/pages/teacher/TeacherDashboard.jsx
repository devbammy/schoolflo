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
import { format, isValid, isPast } from 'date-fns';
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

const ATTENDANCE_COLORS = {
  Present: '#10B981',
  Absent: '#EF4444',
  Late: '#F59E0B',
  Excused: '#6B7280',
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

  const totalAttendance = Object.values(todayAttendance).reduce(
    (sum, n) => sum + (Number(n) || 0),
    0,
  );
  const attendancePct = (count) =>
    totalAttendance > 0 ? Math.round((count / totalAttendance) * 100) : 0;

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
    },
    {
      label: 'Total Assignments',
      value: stats.totalAssignments ?? 0,
      sub: `${stats.upcomingAssignments ?? 0} active`,
      icon: ClipboardList,
      color: '#1A4FAB',
    },
    {
      label: 'Pending Grades',
      value: stats.pendingGrades ?? 0,
      sub: stats.pendingGrades > 0 ? 'Need attention' : 'All graded ✓',
      icon: BookOpen,
      color: stats.pendingGrades > 0 ? '#F59E0B' : '#10B981',
    },
    {
      label: 'Today Present',
      value: todayAttendance.Present ?? 0,
      sub:
        totalAttendance > 0
          ? `${attendancePct(todayAttendance.Present)}% attendance`
          : 'Not marked yet',
      icon: CheckSquare,
      color: '#10B981',
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
        {statCards.map((s) => (
          <div
            key={s.label}
            className="stat-card"
            style={{ '--accent-color': s.color }}
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
                        <td
                          style={{
                            color: overdue
                              ? 'var(--clr-danger)'
                              : 'var(--clr-text-2)',
                            fontSize: '0.875rem',
                            fontWeight: overdue ? 600 : 400,
                          }}
                        >
                          {safeFormat(a.dueDate, 'dd MMM yyyy')}
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
            <div>
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
                  {['Present', 'Absent', 'Late', 'Excused'].map((status) => {
                    const count = Number(todayAttendance[status]) || 0;
                    const pct = attendancePct(count);
                    const color = ATTENDANCE_COLORS[status];
                    return (
                      <div key={status} style={{ marginBottom: 16 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 5,
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              color: 'var(--clr-text-2)',
                            }}
                          >
                            {status}
                          </span>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '0.8125rem',
                                color: 'var(--clr-text-3)',
                              }}
                            >
                              {pct}%
                            </span>
                            <span
                              style={{
                                fontWeight: 700,
                                color,
                                minWidth: 20,
                                textAlign: 'right',
                              }}
                            >
                              {count}
                            </span>
                          </div>
                        </div>
                        {/* Track */}
                        <div
                          style={{
                            height: 7,
                            borderRadius: 4,
                            background: 'var(--clr-bg-alt)',
                            overflow: 'hidden',
                          }}
                        >
                          {/* Fill — borderRadius matches track */}
                          <div
                            style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: color,
                              borderRadius: 4,
                              transition: 'width 0.7s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {totalAttendance === 0 && (
                    <p
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--clr-text-3)',
                        textAlign: 'center',
                        marginBottom: 12,
                      }}
                    >
                      Attendance not marked yet today
                    </p>
                  )}
                </>
              )}

              <button
                className="btn btn--primary btn--full"
                style={{ marginTop: className ? 4 : 0 }}
                onClick={() => navigate('/teacher/attendance')}
              >
                Mark Attendance
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
