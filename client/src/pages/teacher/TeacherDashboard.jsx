// ─── TeacherDashboard.jsx ─────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Users,
  BookOpen,
  CheckSquare,
  Bell,
} from 'lucide-react';
import { dashboardService } from '../../services/api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function TeacherDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    dashboardService
      .getTeacher()
      .then((r) => setData(r.data.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  const { teacher, stats, assignments, todayAttendance, announcements } = data;

  const statCards = [
    {
      label: 'My Class',
      value: teacher.classTeacher?.name || '—',
      icon: Users,
      color: '#0891B2',
    },
    {
      label: 'Assignments',
      value: stats.assignmentsCreated || 0,
      icon: ClipboardList,
      color: '#1A4FAB',
    },
    {
      label: 'Pending Grades',
      value: stats.pendingGrades || 0,
      icon: BookOpen,
      color: '#F59E0B',
    },
    {
      label: 'Today Present',
      value: todayAttendance?.Present || 0,
      icon: CheckSquare,
      color: '#10B981',
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">
            Good morning, {teacher.fullName?.split(' ')[0]}!
          </h1>
          <p className="page-header__subtitle">
            Here's what's happening in your class today
          </p>
        </div>
      </div>

      <div className="stats-grid">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="stat-card "
            style={{ '--accent-color': s.color }}
          >
            <div className="stat-card__icon">
              <s.icon size={22} />
            </div>
            <div className="stat-card__content">
              <div className="stat-card__label">{s.label}</div>
              <div className="stat-card__value small-text">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card__header">
            <span className="card__title">Upcoming Assignments</span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => navigate('/teacher/assignments')}
            >
              Manage
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
                        padding: 32,
                        color: 'var(--clr-text-3)',
                      }}
                    >
                      No assignments
                    </td>
                  </tr>
                ) : (
                  assignments.map((a) => (
                    <tr key={a._id}>
                      <td style={{ fontWeight: 500 }}>{a.title}</td>
                      <td>{a.subject?.name}</td>
                      <td
                        style={{
                          color:
                            new Date(a.dueDate) < new Date()
                              ? 'var(--clr-danger)'
                              : 'var(--clr-text-2)',
                          fontSize: '0.875rem',
                        }}
                      >
                        {format(new Date(a.dueDate), 'dd MMM yyyy')}
                      </td>
                      <td>
                        <span
                          className={`badge badge--${new Date(a.dueDate) < new Date() ? 'danger' : 'success'}`}
                        >
                          {new Date(a.dueDate) < new Date()
                            ? 'Overdue'
                            : 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <span className="card__title">Today's Attendance</span>
          </div>
          <div className="card__body">
            {['Present', 'Absent', 'Late'].map((status, i) => {
              const colors = ['#10B981', '#EF4444', '#F59E0B'];
              const count = todayAttendance?.[status] || 0;
              const total = Object.values(todayAttendance || {}).reduce(
                (a, b) => a + b,
                0,
              );
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={status} style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                      {status}
                    </span>
                    <span
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        color: colors[i],
                      }}
                    >
                      {count}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: 'var(--clr-bg-alt)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: colors[i],
                        borderRadius: 3,
                        transition: 'width 0.8s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <button
              className="btn btn--primary btn--full"
              onClick={() => navigate('/teacher/attendance')}
              style={{ marginTop: 8 }}
            >
              Mark Attendance
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
