// ─── StudentDashboard.jsx ─────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { BookOpen, FileText, Award, TrendingUp } from 'lucide-react';
import { dashboardService } from '../../services/api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getCurrentAcademicYear } from '../../utils/academicYear';
import { CA_MAX, caTotal } from '../../utils/scoreComponents';

export default function StudentDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardService
      .getStudent({
        term: 'First Term',
        academicYear: getCurrentAcademicYear(),
      })
      .then((r) => {
        setData(r.data.data);
      })

      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );

  const {
    student,
    stats,
    recentResults,
    pendingAssignments,
    announcements,
    feeBalance,
  } = data || {};
  const attendance = stats.attendance || {};
  const attendancePct = attendance.percentage || 0;

  const statCards = [
    {
      label: 'Average Score',
      value: stats.averageScore ? `${stats.averageScore}%` : '—',
      icon: TrendingUp,
      color: '#1A4FAB',
    },
    {
      label: 'Attendance',
      value: `${attendancePct}%`,
      icon: Award,
      color: attendancePct >= 75 ? '#10B981' : '#F59E0B',
    },
    {
      label: 'Subjects',
      value: stats.subjectCount || 0,
      icon: BookOpen,
      color: '#0891B2',
    },
    {
      label: 'Pending Tasks',
      value: stats.pendingAssignmentsCount || 0,
      icon: FileText,
      color: '#F59E0B',
    },
  ];

  const getGradeClass = (score) => {
    if (score >= 70) return 'A';
    if (score >= 60) return 'B';
    if (score >= 50) return 'C';
    if (score >= 45) return 'D';
    if (score >= 40) return 'E';
    return 'F';
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Welcome, {student?.firstName}!</h1>
          <p className="page-header__subtitle">
            {student?.studentProfile?.class?.name} •{' '}
            {student?.studentProfile?.admissionNumber}
          </p>
        </div>
      </div>

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
              <div className="stat-card__value">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        {/* Recent Results */}
        <div className="card">
          <div className="card__header">
            <span className="card__title">Recent Results</span>
          </div>
          {recentResults.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <p className="empty-state__text">No published results yet</p>
            </div>
          ) : (
            <div
              className="table-wrapper"
              style={{ border: 'none', borderRadius: 0 }}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>CA Total /{CA_MAX}</th>
                    <th>Exam</th>
                    <th>Total</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {recentResults.map((r) => {
                    const g = getGradeClass(r.totalScore);
                    return (
                      <tr key={r._id}>
                        <td style={{ fontWeight: 600 }}>{r.subject?.name}</td>
                        <td>{caTotal(r.scores)}</td>
                        <td>{r.scores?.exam || 0}</td>
                        <td
                          style={{
                            fontWeight: 700,
                            fontFamily: 'var(--font-display)',
                          }}
                        >
                          {r.totalScore}
                        </td>
                        <td>
                          <span className={`grade grade-${g}`}>{g}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Pending Assignments */}
          <div className="card">
            <div className="card__header">
              <span className="card__title">Due Assignments</span>
            </div>
            <div
              className="card__body"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              {pendingAssignments.length === 0 ? (
                <p
                  style={{
                    color: 'var(--clr-text-3)',
                    fontSize: '0.9rem',
                    textAlign: 'center',
                    padding: 16,
                  }}
                >
                  All caught up! 🎉
                </p>
              ) : (
                pendingAssignments.map((a) => (
                  <div
                    key={a._id}
                    style={{
                      padding: 12,
                      background: 'var(--clr-bg)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--clr-border)',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '0.9375rem',
                        marginBottom: 4,
                      }}
                    >
                      {a.title}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          color: 'var(--clr-text-3)',
                        }}
                      >
                        {a.subject?.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: 'var(--clr-warning)',
                        }}
                      >
                        Due {format(new Date(a.dueDate), 'dd MMM')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Fee Status */}
          {feeBalance && (
            <div className="card">
              <div className="card__header">
                <span className="card__title">Fee Status</span>
              </div>
              <div className="card__body">
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--clr-text-3)',
                      marginBottom: 4,
                    }}
                  >
                    {feeBalance.feeStructure?.title}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.5rem',
                      fontWeight: 700,
                    }}
                  >
                    ₦{(feeBalance.paidTotal || 0).toLocaleString()}
                    <span
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 400,
                        color: 'var(--clr-text-3)',
                      }}
                    >
                      {' '}
                      / ₦{(feeBalance.totalAmount || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 4,
                    background: 'var(--clr-bg-alt)',
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 4,
                      width: `${feeBalance.percentPaid || 0}%`,
                      background:
                        feeBalance.status === 'Paid'
                          ? 'var(--clr-success)'
                          : 'var(--clr-warning)',
                    }}
                  />
                </div>
                <span
                  className={`badge badge--${feeBalance.status === 'Paid' ? 'success' : 'warning'}`}
                >
                  {feeBalance.status}
                  {feeBalance.outstanding > 0 &&
                    ` — ₦${feeBalance.outstanding.toLocaleString()} left`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
