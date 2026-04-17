import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  GraduationCap,
  DollarSign,
  TrendingUp,
  UserCheck,
  AlertCircle,
  CheckCircle,
  Clock,
  Bell,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { dashboardService } from '../../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
);

const CURRENT_TERM = 'First Term';
const CURRENT_YEAR = '2024/2025';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await dashboardService.getAdmin({
          term: CURRENT_TERM,
          academicYear: CURRENT_YEAR,
        });
        setData(res.data.data);
      } catch (err) {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading)
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
        }}
      >
        <div className="spinner" />
      </div>
    );

  const {
    stats = {},
    enrollmentTrend = [],
    recentPayments = [],
    announcements = [],
  } = data || {};
  const attendance = stats.attendance || {};
  const payments = stats.payments || {};

  const statCards = [
    {
      label: 'Total Students',
      value: stats.totalStudents || 0,
      icon: Users,
      color: '#1A4FAB',
      trend: '+12 this month',
    },
    {
      label: 'Teachers',
      value: stats.totalTeachers || 0,
      icon: GraduationCap,
      color: '#0891B2',
      trend: `${stats.totalParents || 0} parents`,
    },
    {
      label: 'Revenue (Term)',
      value: `₦${((payments.totalRevenue || 0) / 1000).toFixed(0)}K`,
      icon: DollarSign,
      color: '#10B981',
      trend: `${payments.Paid || 0} paid`,
    },
    {
      label: 'Pending Fees',
      value: payments.Pending || 0,
      icon: AlertCircle,
      color: '#F59E0B',
      trend: `${payments.Partial || 0} partial`,
    },
  ];

  const attendanceChartData = {
    labels: ['Present', 'Absent', 'Late'],
    datasets: [
      {
        data: [
          attendance.Present || 0,
          attendance.Absent || 0,
          attendance.Late || 0,
        ],
        backgroundColor: ['#10B981', '#EF4444', '#F59E0B'],
        borderWidth: 0,
      },
    ],
  };

  const enrollmentChartData = {
    labels: enrollmentTrend.map((e) => {
      const months = [
        '',
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      return `${months[e._id.month]} ${e._id.year}`;
    }),
    datasets: [
      {
        label: 'New Enrollments',
        data: enrollmentTrend.map((e) => e.count),
        backgroundColor: 'rgba(26,79,171,0.15)',
        borderColor: '#1A4FAB',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#1A4FAB',
        pointRadius: 4,
      },
    ],
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Admin Dashboard</h1>
          <p className="page-header__subtitle">
            {CURRENT_TERM} • {CURRENT_YEAR}
          </p>
        </div>
        <button
          className="btn btn--primary"
          onClick={() => navigate('/admin/announcements')}
        >
          <Bell size={16} /> New Announcement
        </button>
      </div>

      {/* Stat Cards */}
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
              <div className="stat-card__meta">{s.trend}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div
        className="dashboard-grid"
        style={{ marginBottom: 'var(--space-6)' }}
      >
        <div className="card">
          <div className="card__header">
            <span className="card__title">Enrollment Trend (6 months)</span>
          </div>
          <div className="card__body">
            <Line
              data={enrollmentChartData}
              options={{
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
                  x: { grid: { display: false } },
                },
              }}
            />
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <span className="card__title">Today's Attendance</span>
          </div>
          <div
            className="card__body"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <Doughnut
              data={attendanceChartData}
              options={{
                responsive: true,
                cutout: '65%',
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: { padding: 16, font: { family: 'DM Sans' } },
                  },
                },
              }}
            />
            {[
              {
                label: 'Present',
                value: attendance.Present || 0,
                color: '#10B981',
              },
              {
                label: 'Absent',
                value: attendance.Absent || 0,
                color: '#EF4444',
              },
              { label: 'Late', value: attendance.Late || 0, color: '#F59E0B' },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span
                    style={{ fontSize: '0.9rem', color: 'var(--clr-text-2)' }}
                  >
                    {item.label}
                  </span>
                </div>
                <span style={{ fontWeight: 600, color: 'var(--clr-text-1)' }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="dashboard-grid">
        {/* Recent Payments */}
        <div className="card">
          <div className="card__header">
            <span className="card__title">Recent Payments</span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => navigate('/admin/payments')}
            >
              View all
            </button>
          </div>
          <div
            className="table-wrapper"
            style={{ borderRadius: 0, border: 'none' }}
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        textAlign: 'center',
                        color: 'var(--clr-text-3)',
                        padding: 32,
                      }}
                    >
                      No recent payments
                    </td>
                  </tr>
                ) : (
                  recentPayments.map((p) => (
                    <tr key={p._id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {p.student?.firstName} {p.student?.lastName}
                        </div>
                        <div
                          style={{
                            fontSize: '0.8125rem',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          {p.feeStructure?.title}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        ₦{(p.amountPaid || 0).toLocaleString()}
                      </td>
                      <td>
                        <span
                          className={`badge badge--${p.status === 'Paid' ? 'success' : p.status === 'Pending' ? 'warning' : 'info'}`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td
                        style={{
                          color: 'var(--clr-text-3)',
                          fontSize: '0.875rem',
                        }}
                      >
                        {p.paymentDate
                          ? format(new Date(p.paymentDate), 'dd MMM')
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Announcements */}
        <div className="card">
          <div className="card__header">
            <span className="card__title">Recent Announcements</span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => navigate('/admin/announcements')}
            >
              New
            </button>
          </div>
          <div
            className="card__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {announcements.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <Bell size={32} className="empty-state__icon" />
                <p className="empty-state__text">No announcements yet</p>
              </div>
            ) : (
              announcements.map((ann) => (
                <div
                  key={ann._id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    paddingBottom: 16,
                    borderBottom: '1px solid var(--clr-border)',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      flexShrink: 0,
                      background:
                        ann.priority === 'Urgent' ? '#fee2e2' : 'var(--clr-bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color:
                        ann.priority === 'Urgent'
                          ? '#ef4444'
                          : 'var(--clr-primary)',
                    }}
                  >
                    <Bell size={16} />
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '0.9375rem',
                        marginBottom: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {ann.title}
                    </div>
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--clr-text-3)',
                      }}
                    >
                      {ann.author?.firstName} •{' '}
                      {ann.publishedAt
                        ? format(new Date(ann.publishedAt), 'dd MMM')
                        : 'Draft'}
                    </div>
                  </div>
                  <span
                    className={`badge badge--${ann.priority === 'Urgent' ? 'danger' : ann.priority === 'High' ? 'warning' : 'neutral'}`}
                  >
                    {ann.priority}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
