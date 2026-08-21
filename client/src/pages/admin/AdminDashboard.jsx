import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Info,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
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
import { Line, Doughnut } from 'react-chartjs-2';
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

const MONTHS = [
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

// Colour lives in the stylesheet (`.attention-item--{severity}`); only the
// glyph has to be chosen in JS.
const SEVERITY_ICON = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info,
};

const naira = (n) => `₦${Math.round(n || 0).toLocaleString()}`;

const compactNaira = (n) => {
  const v = Math.round(n || 0);
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₦${Math.round(v / 1_000)}K`;
  return `₦${v}`;
};

const dayLabel = (daysAway) => {
  if (daysAway <= 0) return 'Today';
  if (daysAway === 1) return 'Tomorrow';
  return `In ${daysAway} days`;
};

/**
 * One item on the worklist: what is wrong, how big it is, and the single link
 * that starts fixing it. The whole row is the target — an admin scanning this
 * panel is looking for somewhere to click, not something to read twice.
 */
function AttentionItem({ item, onAct }) {
  const Icon = SEVERITY_ICON[item.severity] || Info;

  return (
    <button
      type="button"
      className={`attention-item attention-item--${item.severity}`}
      onClick={() => onAct(item.action.to)}
    >
      <span className="attention-item__icon">
        <Icon size={18} />
      </span>
      <span className="attention-item__body">
        <span className="attention-item__title">{item.title}</span>
        <span className="attention-item__detail">{item.detail}</span>
      </span>
      <span className="attention-item__cta">
        {item.action.label}
        <ArrowRight size={14} />
      </span>
    </button>
  );
}

/**
 * A pulse tile is a number plus the thing that makes it mean something — a
 * trend, a denominator, or a share. A figure with no comparison is a figure an
 * admin cannot act on.
 */
function PulseTile({ label, value, meta, delta, icon: Icon, color, onClick }) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const TrendIcon = hasDelta && delta < 0 ? TrendingDown : TrendingUp;

  return (
    <div
      className={`pulse-tile${onClick ? ' pulse-tile--link' : ''}`}
      style={{ '--accent-color': color }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="pulse-tile__head">
        <span className="pulse-tile__label">{label}</span>
        <span className="pulse-tile__icon">
          <Icon size={16} />
        </span>
      </div>
      <div className="pulse-tile__value">{value}</div>
      <div className="pulse-tile__foot">
        {hasDelta && (
          <span
            className={`pulse-tile__delta ${delta < 0 ? 'is-down' : 'is-up'}`}
          >
            <TrendIcon size={13} />
            {delta > 0 ? '+' : ''}
            {delta} pts
          </span>
        )}
        <span className="pulse-tile__meta">{meta}</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async ({ silent } = {}) => {
    if (silent) setRefreshing(true);
    try {
      // No term is sent: the server reads the live academic calendar, so the
      // dashboard cannot drift onto a term the school has already finished.
      const res = await dashboardService.getAdmin();
      setData(res.data.data);
    } catch (err) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    context = {},
    pulse = {},
    attention = [],
    upcoming = [],
    stats = {},
    enrollmentTrend = [],
    recentPayments = [],
    announcements = [],
    generatedAt,
  } = data || {};

  const attendance = pulse.attendance || {};
  const fees = pulse.fees || {};

  const subtitle = [
    context.term,
    context.academicYear,
    context.weekOfTerm ? `Week ${context.weekOfTerm}` : null,
    context.daysToTermEnd !== null && context.daysToTermEnd !== undefined
      ? `${context.daysToTermEnd} days to term end`
      : null,
  ]
    .filter(Boolean)
    .join(' • ');

  const registerIncomplete =
    attendance.isSchoolDay &&
    attendance.classesMarked < attendance.classesTotal;

  const attendanceChartData = {
    labels: ['Present', 'Absent', 'Late', 'Excused'],
    datasets: [
      {
        data: [
          attendance.Present || 0,
          attendance.Absent || 0,
          attendance.Late || 0,
          attendance.Excused || 0,
        ],
        backgroundColor: ['#10B981', '#EF4444', '#F59E0B', '#7889A8'],
        borderWidth: 0,
      },
    ],
  };

  const enrollmentChartData = {
    labels: enrollmentTrend.map(
      (e) => `${MONTHS[e._id.month]} ${String(e._id.year).slice(2)}`,
    ),
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
        pointRadius: 3,
      },
    ],
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">School Overview</h1>
          <p className="page-header__subtitle">
            {subtitle || 'No active academic calendar'}
            {generatedAt && (
              <span style={{ color: 'var(--clr-text-3)' }}>
                {' '}
                • as of {format(new Date(generatedAt), 'HH:mm')}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            className="btn btn--ghost"
            onClick={() => load({ silent: true })}
            disabled={refreshing}
          >
            <RefreshCw
              size={16}
              style={{
                animation: refreshing ? 'spin 800ms linear infinite' : 'none',
              }}
            />
            Refresh
          </button>
          <button
            className="btn btn--primary"
            onClick={() => navigate('/admin/announcements')}
          >
            <Bell size={16} /> New Announcement
          </button>
        </div>
      </div>

      {/* ── What needs my attention ─────────────────────────────────────────
          Deliberately above the numbers: an admin opening this page has a
          finite amount of attention, and it should land on the exceptions
          before it lands on the metrics. */}
      <section className="attention-panel">
        <div className="attention-panel__head">
          <h2 className="attention-panel__title">Needs your attention</h2>
          {attention.length > 0 && (
            <span className="attention-panel__count">
              {attention.length} item{attention.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {attention.length === 0 ? (
          <div className="attention-clear">
            <CheckCircle2 size={22} />
            <div>
              <div className="attention-clear__title">Nothing needs you</div>
              <div className="attention-clear__detail">
                Registers are in, fees are on track and results are released.
              </div>
            </div>
          </div>
        ) : (
          <div className="attention-list">
            {attention.map((item) => (
              <AttentionItem key={item.id} item={item} onAct={navigate} />
            ))}
          </div>
        )}
      </section>

      {/* ── What is happening ───────────────────────────────────────────── */}
      <div className="pulse-grid">
        <PulseTile
          label="Attendance today"
          value={
            attendance.marked > 0
              ? `${attendance.rate}%`
              : attendance.isSchoolDay
                ? 'Not marked'
                : '—'
          }
          delta={attendance.marked > 0 ? attendance.delta : null}
          meta={
            attendance.marked > 0
              ? `${attendance.Present + attendance.Late} of ${attendance.marked} in school`
              : attendance.isSchoolDay
                ? 'No register submitted yet'
                : 'Not a school day'
          }
          icon={UserCheck}
          color="var(--clr-success)"
          onClick={() => navigate('/admin/students')}
        />
        <PulseTile
          label="Registers in"
          value={`${attendance.classesMarked || 0}/${attendance.classesTotal || 0}`}
          meta={
            registerIncomplete
              ? `${(attendance.classesTotal || 0) - (attendance.classesMarked || 0)} classes outstanding`
              : 'All classes reported'
          }
          icon={Users}
          color={registerIncomplete ? 'var(--clr-warning)' : 'var(--clr-info)'}
          onClick={() => navigate('/admin/classes')}
        />
        <PulseTile
          label="Fees collected"
          value={fees.hasStructures ? `${fees.collectionRate}%` : '—'}
          meta={
            fees.hasStructures
              ? `${compactNaira(fees.collected)} of ${compactNaira(fees.billed)} billed`
              : 'No fee structure this term'
          }
          icon={Wallet}
          color="var(--clr-primary)"
          onClick={() => navigate('/admin/fees')}
        />
        <PulseTile
          label="Outstanding"
          value={compactNaira(fees.outstanding)}
          meta={
            fees.studentsOwing
              ? `${fees.studentsOwing} students owing`
              : 'Everyone is settled'
          }
          icon={AlertCircle}
          color={
            fees.overdue?.students ? 'var(--clr-danger)' : 'var(--clr-text-3)'
          }
          onClick={() => navigate('/admin/payments')}
        />
      </div>

      {/* ── What is coming, and the detail behind the numbers ───────────── */}
      <div
        className="dashboard-grid"
        style={{ marginBottom: 'var(--space-6)' }}
      >
        <div className="card">
          <div className="card__header">
            <span className="card__title">Enrollment trend (6 months)</span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--clr-text-3)' }}>
              {stats.activeStudents || 0} active of {stats.totalStudents || 0}
            </span>
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
            <span className="card__title">Next 14 days</span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => navigate('/admin/calendar')}
            >
              Calendar
            </button>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            {upcoming.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <CalendarDays size={32} className="empty-state__icon" />
                <p className="empty-state__text">
                  Nothing scheduled in the next fortnight
                </p>
              </div>
            ) : (
              <ul className="upcoming-list">
                {upcoming.map((e, i) => (
                  <li key={`${e.title}-${i}`} className="upcoming-item">
                    <span
                      className="upcoming-item__marker"
                      style={{ background: e.color || 'var(--clr-primary)' }}
                    />
                    <div className="upcoming-item__body">
                      <div className="upcoming-item__title">{e.title}</div>
                      <div className="upcoming-item__meta">
                        {e.type} • {format(new Date(e.startDate), 'EEE d MMM')}
                      </div>
                    </div>
                    <span
                      className={`upcoming-item__when${e.daysAway <= 1 ? ' is-soon' : ''}`}
                    >
                      {dayLabel(e.daysAway)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Recent Payments */}
        <div className="card">
          <div className="card__header">
            <span className="card__title">Recent payments</span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => navigate('/admin/payments')}
            >
              View all <ChevronRight size={14} />
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
                      <td style={{ fontWeight: 600 }}>{naira(p.amountPaid)}</td>
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

        {/* Attendance breakdown + announcements */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-6)',
          }}
        >
          <div className="card">
            <div className="card__header">
              <span className="card__title">Today's register</span>
            </div>
            <div className="card__body">
              {attendance.marked > 0 ? (
                <Doughnut
                  data={attendanceChartData}
                  options={{
                    responsive: true,
                    cutout: '65%',
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: { padding: 12, font: { family: 'DM Sans' } },
                      },
                    },
                  }}
                />
              ) : (
                <div className="empty-state" style={{ padding: 24 }}>
                  <UserCheck size={28} className="empty-state__icon" />
                  <p className="empty-state__text">
                    {attendance.isSchoolDay
                      ? 'No attendance marked yet today'
                      : 'School is closed today'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__header">
              <span className="card__title">Latest announcements</span>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => navigate('/admin/announcements')}
              >
                New
              </button>
            </div>
            <div
              className="card__body"
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              {announcements.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <Bell size={28} className="empty-state__icon" />
                  <p className="empty-state__text">No announcements yet</p>
                </div>
              ) : (
                announcements.map((ann) => (
                  <div key={ann._id} className="announcement-row">
                    <div
                      className="announcement-row__icon"
                      style={{
                        background:
                          ann.priority === 'Urgent'
                            ? '#fee2e2'
                            : 'var(--clr-bg)',
                        color:
                          ann.priority === 'Urgent'
                            ? '#ef4444'
                            : 'var(--clr-primary)',
                      }}
                    >
                      <Bell size={15} />
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div className="announcement-row__title">{ann.title}</div>
                      <div className="announcement-row__meta">
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
      </div>
    </>
  );
}
