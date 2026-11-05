import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Heart,
  Info,
  RefreshCw,
  School,
  Users,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { dashboardService } from '../../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  DashHeader,
  DonutCard,
  MeterCard,
  MiniCalendar,
  Noticeboard,
  QuickTiles,
  StatTile,
} from '../../components/dashboard/DashboardParts';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const TILES = [
  '/admin/students',
  '/admin/teachers',
  '/admin/fees',
  '/admin/payments',
  '/admin/tasks',
  '/admin/announcements',
];

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

// A method keeps its colour whichever others are present that term.
const MODE_COLORS = {
  Paystack: '#1A4FAB',
  Flutterwave: '#0891B2',
  Cash: '#E8590C',
  'Bank Transfer': '#7C3AED',
};

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
    stats = {},
    enrollmentTrend = [],
    recentPayments = [],
    announcements = [],
    feeModes = [],
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

  const attendanceFootnote = () => {
    if (attendance.marked > 0) {
      const inSchool = attendance.Present + attendance.Late;
      const trend =
        typeof attendance.delta === 'number'
          ? ` · ${attendance.delta > 0 ? '+' : ''}${attendance.delta} pts on the recent average`
          : '';
      return `${inSchool} of ${attendance.marked} in school${trend}`;
    }
    return null;
  };

  const enrollmentChartData = {
    labels: enrollmentTrend.map(
      (e) => `${MONTHS[e._id.month]} ${String(e._id.year).slice(2)}`,
    ),
    datasets: [
      {
        label: 'New enrollments',
        data: enrollmentTrend.map((e) => e.count),
        backgroundColor: '#1A4FAB',
        borderRadius: 4,
        maxBarThickness: 36,
      },
    ],
  };

  return (
    <>
      <DashHeader
        title="School Overview"
        subtitle={
          <>
            {subtitle || 'No active academic calendar'}
            {generatedAt && ` • as of ${format(new Date(generatedAt), 'HH:mm')}`}
          </>
        }
      >
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
      </DashHeader>

      <QuickTiles role="Admin" paths={TILES} />

      <div className="dash-main">
        <div className="dash-main__column">
          <Noticeboard announcements={announcements} role="Admin" canPost />

          <div className="stat-tiles">
            <StatTile
              label="Students"
              value={(stats.totalStudents || 0).toLocaleString()}
              sub={`${(stats.activeStudents || 0).toLocaleString()} active`}
              icon={Users}
              to="/admin/students"
            />
            <StatTile
              label="Teachers"
              value={(stats.totalTeachers || 0).toLocaleString()}
              icon={GraduationCap}
              to="/admin/teachers"
            />
            <StatTile
              label="Parents"
              value={(stats.totalParents || 0).toLocaleString()}
              icon={Heart}
              to="/admin/parents"
            />
            <StatTile
              label="Registers"
              value={`${attendance.classesMarked || 0}/${attendance.classesTotal || 0}`}
              sub={
                registerIncomplete
                  ? `${(attendance.classesTotal || 0) - (attendance.classesMarked || 0)} outstanding`
                  : 'All reported'
              }
              icon={School}
              to="/admin/classes"
            />
          </div>
        </div>

        <div className="dash-main__column">
          {/* Kept above the calendar: an admin's attention should land on the
              exceptions before the schedule. */}
          <section className="card dash-card">
            <div className="card__header">
              <h2 className="card__title">Needs your attention</h2>
              {attention.length > 0 && (
                <span className="attention-panel__count">
                  {attention.length} item{attention.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div className="dash-attention">
              {attention.length === 0 ? (
                <div className="attention-clear">
                  <CheckCircle2 size={22} />
                  <div>
                    <div className="attention-clear__title">
                      Nothing needs you
                    </div>
                    <div className="attention-clear__detail">
                      Registers are in, fees are on track and results are
                      released.
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
            </div>
          </section>

          <MiniCalendar role="Admin" />
        </div>
      </div>

      <div className="dash-row">
        <DonutCard
          title="Attendance today"
          centerValue={attendance.marked > 0 ? `${attendance.rate}%` : undefined}
          centerLabel="in school"
          emptyText={
            attendance.isSchoolDay
              ? 'No register submitted yet today'
              : 'School is closed today'
          }
          footnote={attendanceFootnote()}
          segments={[
            { label: 'Present', value: attendance.Present || 0, color: '#10B981' },
            { label: 'Late', value: attendance.Late || 0, color: '#F59E0B' },
            { label: 'Excused', value: attendance.Excused || 0, color: '#3B82F6' },
            { label: 'Absent', value: attendance.Absent || 0, color: '#EF4444' },
          ]}
        />

        <MeterCard
          title="Fees this term"
          isEmpty={!fees.hasStructures}
          emptyText="No fee structure this term"
          value={`${fees.collectionRate || 0}%`}
          caption={`collected: ${compactNaira(fees.collected)} of ${compactNaira(fees.billed)} billed`}
          percent={fees.collectionRate}
          rows={[
            { label: 'Outstanding', value: naira(fees.outstanding) },
            { label: 'Students owing', value: fees.studentsOwing || 0 },
          ]}
          action={
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => navigate('/admin/fees')}
            >
              Open
            </button>
          }
        />

        <DonutCard
          title="Fee collection modes"
          emptyText="No money received this term yet"
          formatValue={compactNaira}
          segments={Object.keys(MODE_COLORS).map((gateway) => ({
            label: gateway,
            value: feeModes.find((m) => m.gateway === gateway)?.amount || 0,
            color: MODE_COLORS[gateway],
          }))}
        />
      </div>

      <div className="dashboard-grid">
        <section className="card dash-card">
          <div className="card__header">
            <h2 className="card__title">Recent payments</h2>
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
        </section>

        <section className="card dash-card">
          <div className="card__header">
            <h2 className="card__title">New enrollments, 6 months</h2>
          </div>
          <div className="card__body">
            {enrollmentTrend.length === 0 ? (
              <div className="dash-empty">
                No students enrolled in the last 6 months
              </div>
            ) : (
              <Bar
                data={enrollmentChartData}
                options={{
                  responsive: true,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: { precision: 0 },
                      grid: { color: 'rgba(0,0,0,0.04)' },
                    },
                    x: { grid: { display: false } },
                  },
                }}
              />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
