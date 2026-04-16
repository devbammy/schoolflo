import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Users, BookOpen, CheckSquare } from 'lucide-react';
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
      .then((r) => {
        setData(r.data.data);
      })
      .catch((e) => {
        toast.error('Failed to load dashboard');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }

  // ✅ SAFE FALLBACKS
  const teacher = data?.teacher || {};
  const stats = data?.stats || {};
  const assignments = data?.assignments || [];
  const todayAttendance = data?.todayAttendance || {
    Present: 0,
    Absent: 0,
    Late: 0,
  };

  const firstName = teacher.fullName
    ? teacher.fullName.split(' ')[0]
    : 'Teacher';

  const now = new Date();

  const totalAttendance = Object.values(todayAttendance).reduce(
    (a, b) => a + b,
    0,
  );

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
      value: todayAttendance.Present || 0,
      icon: CheckSquare,
      color: '#10B981',
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Good morning, {firstName}!</h1>
          <p className="page-header__subtitle">
            Here's what's happening in your class today
          </p>
        </div>
      </div>

      {/* Stats */}
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
              <div className="stat-card__value small-text">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        {/* Assignments */}
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

          <div className="table-wrapper" style={{ border: 'none' }}>
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
                      style={{ textAlign: 'center', padding: 32 }}
                    >
                      No assignments
                    </td>
                  </tr>
                ) : (
                  assignments.map((a) => {
                    const isOverdue = new Date(a.dueDate) < now;

                    return (
                      <tr key={a._id}>
                        <td style={{ fontWeight: 500 }}>{a.title}</td>
                        <td>{a.subject?.name || '—'}</td>
                        <td
                          style={{
                            color: isOverdue
                              ? 'var(--clr-danger)'
                              : 'var(--clr-text-2)',
                          }}
                        >
                          {format(new Date(a.dueDate), 'dd MMM yyyy')}
                        </td>
                        <td>
                          <span
                            className={`badge badge--${
                              isOverdue ? 'danger' : 'success'
                            }`}
                          >
                            {isOverdue ? 'Overdue' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Attendance */}
        <div className="card">
          <div className="card__header">
            <span className="card__title">Today's Attendance</span>
          </div>

          <div className="card__body">
            {['Present', 'Absent', 'Late'].map((status, i) => {
              const colors = ['#10B981', '#EF4444', '#F59E0B'];
              const count = todayAttendance[status] || 0;
              const pct =
                totalAttendance > 0
                  ? Math.round((count / totalAttendance) * 100)
                  : 0;

              return (
                <div key={status} style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <span>{status}</span>
                    <span style={{ color: colors[i], fontWeight: 700 }}>
                      {count}
                    </span>
                  </div>

                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: 'var(--clr-bg-alt)',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: colors[i],
                      }}
                    />
                  </div>
                </div>
              );
            })}

            <button
              className="btn btn--primary btn--full"
              onClick={() => navigate('/teacher/attendance')}
            >
              Mark Attendance
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
