import React, { useEffect, useState, useCallback } from 'react';
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Plus,
  Search,
  Download,
} from 'lucide-react';
import { paymentService, feeService, userService } from '../../services/api';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  generateAcademicYearOptions,
  getCurrentAcademicYear,
} from '../../utils/academicYear';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

const academicYears = generateAcademicYearOptions({
  count: 3,
  includeFuture: true,
});

const TERMS = ['First Term', 'Second Term', 'Third Term'];
const GATEWAYS = ['Cash', 'Bank Transfer', 'Paystack', 'Flutterwave'];
const STATUS_COLORS = {
  Paid: 'success',
  Pending: 'warning',
  Partial: 'info',
  Overdue: 'danger',
};

export default function PaymentsPage() {
  const [report, setReport] = useState(null);
  const [payments, setPayments] = useState([]);
  const [fees, setFees] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    term: 'First Term',
    academicYear: getCurrentAcademicYear(),
  });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [manualForm, setManualForm] = useState({
    studentId: '',
    feeStructureId: '',
    amountPaid: '',
    gateway: 'Cash',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [manualBalance, setManualBalance] = useState(null);

  const loadReport = useCallback(async () => {
    try {
      const res = await paymentService.getReport({
        term: filters.term,
        academicYear: filters.academicYear,
      });
      setReport(res.data.data);
    } catch {
      toast.error('Failed to load report');
    }
  }, [filters]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch via report's recent transactions (already in report payload)
      // For a paginated list we'd call a separate endpoint — using report data here
      await loadReport();
    } finally {
      setLoading(false);
    }
  }, [loadReport]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);
  useEffect(() => {
    Promise.all([
      feeService.getAll({
        term: filters.term,
        academicYear: filters.academicYear,
      }),
      userService.getAll({ role: 'Student', limit: 100 }),
    ]).then(([f, s]) => {
      setFees(f.data.data?.fees || []);
      setStudents(s.data.data || []);
    });
  }, [filters]);

  // Once a student and a fee are chosen, show what that fee still owes —
  // online payments included. Cash cannot be recorded beyond it, and the
  // clerk should see the figure before taking the money, not after.
  useEffect(() => {
    const { studentId, feeStructureId } = manualForm;
    if (!studentId || !feeStructureId) {
      setManualBalance(null);
      return;
    }

    let stale = false;
    paymentService
      .getBalances(studentId, { feeStructureId })
      .then((res) => {
        if (stale) return;
        const balance = res.data.data?.balances?.[0] || null;
        setManualBalance(balance);
        setManualForm((f) =>
          f.amountPaid ? f : { ...f, amountPaid: String(balance?.outstanding ?? '') },
        );
      })
      .catch(() => {
        if (!stale) setManualBalance(null);
      });

    return () => {
      stale = true;
    };
  }, [manualForm.studentId, manualForm.feeStructureId]);

  const overview = report?.overview || {};
  const byStatus = report?.byStatus || [];
  const byGateway = report?.byGateway || [];
  const recent = report?.recentTransactions || [];

  const barData = {
    labels: byGateway.map((g) => g._id),
    datasets: [
      {
        label: 'Amount Collected (₦)',
        data: byGateway.map((g) => g.amount),
        backgroundColor: ['#1A4FAB', '#10B981', '#F59E0B', '#7C3AED'],
        borderRadius: 6,
      },
    ],
  };

  const handleManualSave = async (e) => {
    e.preventDefault();
    if (
      !manualForm.studentId ||
      !manualForm.feeStructureId ||
      !manualForm.amountPaid
    ) {
      return toast.error('Fill all required fields');
    }
    setSaving(true);
    try {
      const res = await paymentService.recordManual({
        studentId: manualForm.studentId,
        feeStructureId: manualForm.feeStructureId,
        amountPaid: parseFloat(manualForm.amountPaid),
        gateway: manualForm.gateway,
        notes: manualForm.notes,
      });
      toast.success(
        res.data.data?.outstanding > 0
          ? `Payment recorded — ₦${res.data.data.outstanding.toLocaleString()} still outstanding`
          : 'Payment recorded — this fee is now fully paid',
      );
      setModal(null);
      setManualForm({
        studentId: '',
        feeStructureId: '',
        amountPaid: '',
        gateway: 'Cash',
        notes: '',
      });
      setManualBalance(null);
      loadPayments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const overAmount =
    manualBalance &&
    Number(manualForm.amountPaid) > (manualBalance.outstanding || 0);

  const collectionRate =
    overview.totalExpected > 0
      ? ((overview.totalCollected / overview.totalExpected) * 100).toFixed(1)
      : 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Payments</h1>
          <p className="page-header__subtitle">
            Financial overview and transaction management
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setModal('manual')}>
          <Plus size={16} /> Record Payment
        </button>
      </div>

      {/* Term Filter */}
      <div
        style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}
      >
        {TERMS.map((t) => (
          <button
            key={t}
            className={`btn btn--${filters.term === t ? 'primary' : 'secondary'}`}
            onClick={() => setFilters((f) => ({ ...f, term: t }))}
          >
            {t}
          </button>
        ))}
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: 160 }}
          value={filters.academicYear}
          onChange={(e) =>
            setFilters((f) => ({ ...f, academicYear: e.target.value }))
          }
          required
        >
          {academicYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* Overview Stats */}
      <div className="stats-grid" style={{ marginBottom: 28 }}>
        {[
          {
            label: 'Total Expected',
            value: `₦${((overview.totalExpected || 0) / 1000).toFixed(0)}K`,
            icon: DollarSign,
            color: '#1A4FAB',
          },
          {
            label: 'Collected',
            value: `₦${((overview.totalCollected || 0) / 1000).toFixed(0)}K`,
            icon: CheckCircle,
            color: '#10B981',
            sub: `${collectionRate}% rate`,
          },
          {
            label: 'Outstanding',
            value: `₦${((overview.totalOutstanding || 0) / 1000).toFixed(0)}K`,
            icon: AlertCircle,
            color: '#F59E0B',
          },
          {
            label: 'Transactions',
            value: overview.count || 0,
            icon: TrendingUp,
            color: '#7C3AED',
          },
        ].map((s) => (
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
              {s.sub && <div className="stat-card__meta">{s.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Status + Chart row */}
      <div className="dashboard-grid" style={{ marginBottom: 28 }}>
        {/* By Status */}
        <div className="card">
          <div className="card__header">
            <span className="card__title">Payment Status Breakdown</span>
          </div>
          <div className="card__body">
            {byStatus.length === 0 ? (
              <p
                style={{
                  color: 'var(--clr-text-3)',
                  textAlign: 'center',
                  padding: 24,
                }}
              >
                No data for this period
              </p>
            ) : (
              byStatus.map((s) => {
                const pct =
                  overview.count > 0
                    ? ((s.count / overview.count) * 100).toFixed(0)
                    : 0;
                const COLOR_MAP = {
                  Paid: '#10B981',
                  Pending: '#F59E0B',
                  Partial: '#3B82F6',
                  Overdue: '#EF4444',
                };
                const color = COLOR_MAP[s._id] || '#6B7280';
                return (
                  <div key={s._id} style={{ marginBottom: 18 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        {s._id}
                      </span>
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          fontSize: '0.875rem',
                          color: 'var(--clr-text-3)',
                        }}
                      >
                        <span style={{ fontWeight: 700, color }}>
                          {s.count} students
                        </span>
                        <span>₦{(s.amount || 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: 'var(--clr-bg-alt)',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 4,
                          width: `${pct}%`,
                          background: color,
                          transition: 'width 0.8s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* By Gateway */}
        <div className="card">
          <div className="card__header">
            <span className="card__title">Collections by Gateway</span>
          </div>
          <div className="card__body">
            {byGateway.length === 0 ? (
              <p
                style={{
                  color: 'var(--clr-text-3)',
                  textAlign: 'center',
                  padding: 24,
                }}
              >
                No collections yet
              </p>
            ) : (
              <Bar
                data={barData}
                options={{
                  responsive: true,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: { callback: (v) => `₦${(v / 1000).toFixed(0)}K` },
                      grid: { color: 'rgba(0,0,0,0.04)' },
                    },
                    x: { grid: { display: false } },
                  },
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <div className="card__header">
          <span className="card__title">Recent Transactions</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--clr-text-3)' }}>
            Last 10 entries
          </span>
        </div>
        <div
          className="table-wrapper"
          style={{ border: 'none', borderRadius: 0 }}
        >
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Fee Structure</th>
                <th>Amount Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Gateway</th>
                <th>Receipt</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 48 }}>
                    <div className="spinner" style={{ margin: '0 auto' }} />
                  </td>
                </tr>
              ) : recent.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: 'center',
                      padding: 48,
                      color: 'var(--clr-text-3)',
                    }}
                  >
                    No transactions found
                  </td>
                </tr>
              ) : (
                recent.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {p.student?.firstName} {p.student?.lastName}
                      </div>
                    </td>
                    <td
                      style={{
                        fontSize: '0.875rem',
                        color: 'var(--clr-text-2)',
                      }}
                    >
                      {p.feeStructure?.title || '—'}
                    </td>
                    <td
                      style={{ fontWeight: 700, color: 'var(--clr-success)' }}
                    >
                      ₦{(p.amountPaid || 0).toLocaleString()}
                    </td>
                    <td
                      style={{
                        fontWeight: p.balance > 0 ? 600 : 400,
                        color:
                          p.balance > 0
                            ? 'var(--clr-warning)'
                            : 'var(--clr-text-3)',
                      }}
                    >
                      {p.balance > 0 ? `₦${p.balance.toLocaleString()}` : '—'}
                    </td>
                    <td>
                      <span
                        className={`badge badge--${STATUS_COLORS[p.status] || 'neutral'}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>{p.gateway}</td>
                    <td
                      style={{
                        fontSize: '0.8125rem',
                        fontFamily: 'var(--font-display)',
                        color: 'var(--clr-text-3)',
                      }}
                    >
                      {p.receiptNumber || '—'}
                    </td>
                    <td
                      style={{
                        fontSize: '0.875rem',
                        color: 'var(--clr-text-3)',
                      }}
                    >
                      {p.paymentDate
                        ? format(new Date(p.paymentDate), 'dd MMM yyyy')
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Payment Modal */}
      <Modal
        open={modal === 'manual'}
        onClose={() => setModal(null)}
        title="Record Manual Payment"
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              disabled={saving || overAmount}
              onClick={handleManualSave}
            >
              {saving ? 'Saving...' : 'Record Payment'}
            </button>
          </>
        }
      >
        <form onSubmit={handleManualSave}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Student *</label>
              <select
                className="form-control"
                required
                value={manualForm.studentId}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, studentId: e.target.value }))
                }
              >
                <option value="">Search and select student...</option>
                {students.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.firstName} {s.lastName} —{' '}
                    {s.studentProfile?.admissionNumber || s.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Fee Structure *</label>
              <select
                className="form-control"
                required
                value={manualForm.feeStructureId}
                onChange={(e) =>
                  setManualForm((f) => ({
                    ...f,
                    feeStructureId: e.target.value,
                  }))
                }
              >
                <option value="">Select fee structure...</option>
                {fees.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.title} — ₦{f.totalAmount?.toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
            {manualBalance && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--clr-surface-2, #f6f8fc)',
                  border: '1px solid var(--clr-border)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 18,
                  fontSize: '0.8125rem',
                }}
              >
                {[
                  ['Fee total', manualBalance.totalAmount, 'var(--clr-text-1)'],
                  ['Paid online', manualBalance.paidOnline, 'var(--clr-primary)'],
                  [
                    'Paid at school',
                    manualBalance.paidOffline,
                    'var(--clr-success)',
                  ],
                  [
                    'Still owed',
                    manualBalance.outstanding,
                    'var(--clr-warning)',
                  ],
                ].map(([label, value, color]) => (
                  <div key={label}>
                    <div
                      style={{
                        color: 'var(--clr-text-3)',
                        textTransform: 'uppercase',
                        fontSize: '0.6875rem',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontWeight: 700, color }}>
                      ₦{(value || 0).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Amount Paid (₦) *</label>
                <input
                  type="number"
                  min={1}
                  max={manualBalance?.outstanding || undefined}
                  className="form-control"
                  required
                  value={manualForm.amountPaid}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, amountPaid: e.target.value }))
                  }
                  placeholder="0"
                />
                {overAmount && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--clr-danger)',
                    }}
                  >
                    Only ₦{manualBalance.outstanding.toLocaleString()} is still
                    owed on this fee.
                  </span>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Payment Method *</label>
                <select
                  className="form-control"
                  value={manualForm.gateway}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, gateway: e.target.value }))
                  }
                >
                  {GATEWAYS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Notes (optional)</label>
              <input
                className="form-control"
                value={manualForm.notes}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="e.g. Cash received at school office"
              />
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
