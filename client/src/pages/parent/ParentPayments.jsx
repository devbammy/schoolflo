import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Users } from 'lucide-react';
import { paymentService } from '../../services/api';
import FeeBalanceCard from '../../components/payments/FeeBalanceCard';
import { receiptLabel } from '../../utils/receipts';
import useAuthStore from '../../store/authStore';
import { useFeature } from '../../store/featureStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  getCurrentAcademicYear,
  generateAcademicYearOptions,
} from '../../utils/academicYear';

const TERMS = ['First Term', 'Second Term', 'Third Term'];
const STATUS_BADGE = {
  Paid: 'success',
  Partial: 'info',
  Pending: 'warning',
  Overdue: 'danger',
};

// Small inline avatar
function ChildAvatar({ child, size = 36, active = false }) {
  const initials = `${child.firstName?.[0] || ''}${child.lastName?.[0] || ''}`;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: active ? 'var(--clr-primary)' : '#dbeafe',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.33,
        color: active ? '#fff' : '#1e40af',
        flexShrink: 0,
        overflow: 'hidden',
        transition: 'background 0.2s',
      }}
    >
      {child.avatar?.url ? (
        <img
          src={child.avatar.url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials
      )}
    </div>
  );
}

export default function ParentPayments() {
  const { user } = useAuthStore();
  const canPayOnline = useFeature('onlinePayments');

  // Normalise children — populated objects or bare IDs
  const rawChildren = user?.parentProfile?.children || [];
  const children = rawChildren.filter(
    (c) => c && typeof c === 'object' && c._id,
  );

  const [selectedChild, setSelectedChild] = useState(null);
  const [term, setTerm] = useState('First Term');
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [balances, setBalances] = useState([]);
  const [arrears, setArrears] = useState([]);
  const [arrearsTotal, setArrearsTotal] = useState(0);
  const [totals, setTotals] = useState({});
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(null);

  // Auto-select first child on mount
  useEffect(() => {
    if (children.length > 0 && !selectedChild) {
      setSelectedChild(children[0]);
    }
  }, [children.length]);

  // Load balances + payment history whenever child / term / year changes.
  const load = useCallback(() => {
    if (!selectedChild?._id) return;

    setLoading(true);

    Promise.all([
      paymentService.getStudentPayments(selectedChild._id, {
        term,
        academicYear,
      }),
      // The server works out which fees apply to this child and how much of
      // each is left after everything already received, online and in cash.
      paymentService.getBalances(selectedChild._id, { term, academicYear }),
    ])
      .then(([pRes, bRes]) => {
        setPayments(pRes.data.data?.payments || []);
        setBalances(bRes.data.data?.balances || []);
        setArrears(bRes.data.data?.arrears || []);
        setArrearsTotal(bRes.data.data?.arrearsTotal || 0);
        setTotals(bRes.data.data?.totals || {});
      })
      .catch(() => toast.error('Failed to load payment data'))
      .finally(() => setLoading(false));
  }, [selectedChild?._id, term, academicYear]);

  useEffect(load, [load]);

  // Paystack opens in another tab, so coming back to this one is the moment
  // a part-payment has most likely just gone through.
  useEffect(() => {
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  // ── Pay via Paystack ───────────────────────────────────────────────────────
  const handlePaystack = async (fee, amount) => {
    if (!selectedChild?._id) return;
    setPaying(fee._id);
    try {
      // `amount` is only a request. The server re-checks it against what the
      // fee actually still owes, so a part-payment can never be billed twice
      // and can never exceed the balance.
      const res = await paymentService.initPaystack({
        studentId: selectedChild._id,
        feeStructureId: fee._id,
        amount,
      });
      toast.success('Redirecting to Paystack...');
      // Same tab, not window.open: iPhone Safari blocks a popup opened after
      // an await. The gateway returns the payer to /payments/verify.
      window.location.assign(res.data.data.authorizationUrl);
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Payment initialisation failed',
      );
    } finally {
      setPaying(null);
    }
  };

  // ── No children linked guard ───────────────────────────────────────────────
  if (children.length === 0) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Fee Payments</h1>
            <p className="page-header__subtitle">
              Manage your children's school fees
            </p>
          </div>
        </div>
        <div className="card">
          <div className="empty-state" style={{ padding: '60px 24px' }}>
            <Users size={48} className="empty-state__icon" />
            <p className="empty-state__title">No children linked</p>
            <p className="empty-state__text">
              Your account has no linked students yet. Contact the school admin
              to link your children.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Fee Payments</h1>
          <p className="page-header__subtitle">
            Manage your children's school fees
          </p>
        </div>
      </div>

      {/* ── Child selector ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--clr-text-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 10,
          }}
        >
          Select Child
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {children.map((child) => {
            const active = selectedChild?._id === child._id;
            return (
              <button
                key={child._id}
                onClick={() => setSelectedChild(child)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 16px 8px 10px',
                  borderRadius: 'var(--radius-full)',
                  border: `2px solid ${active ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                  background: active
                    ? 'color-mix(in srgb, var(--clr-primary) 8%, transparent)'
                    : 'var(--clr-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.18s',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <ChildAvatar child={child} size={32} active={active} />
                <div style={{ textAlign: 'left' }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.9375rem',
                      color: active
                        ? 'var(--clr-primary)'
                        : 'var(--clr-text-1)',
                      lineHeight: 1.2,
                    }}
                  >
                    {child.firstName} {child.lastName}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--clr-text-3)',
                      lineHeight: 1.2,
                    }}
                  >
                    {child.studentProfile?.class?.name ||
                      child.studentProfile?.class ||
                      'No class'}
                    {child.studentProfile?.admissionNumber &&
                      ` · ${child.studentProfile.admissionNumber}`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Term / year filters ─────────────────────────────────────────── */}
      <div
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}
      >
        {TERMS.map((t) => (
          <button
            key={t}
            className={`btn btn--${term === t ? 'primary' : 'secondary'} btn--sm`}
            onClick={() => setTerm(t)}
          >
            {t}
          </button>
        ))}
        <select
          className="form-control"
          style={{ width: 140 }}
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
        >
          {generateAcademicYearOptions(5).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* ── Summary strip ─────────────────────────────────────────── */}
          {(totals.paidTotal > 0 || totals.outstanding > 0) && (
            <div
              style={{
                display: 'flex',
                gap: 14,
                marginBottom: 24,
                flexWrap: 'wrap',
              }}
            >
              {[
                {
                  label: 'Paid Online',
                  value: `₦${(totals.paidOnline || 0).toLocaleString()}`,
                  color: 'var(--clr-primary)',
                  bg: '#dbeafe',
                },
                {
                  label: 'Paid at School',
                  value: `₦${(totals.paidOffline || 0).toLocaleString()}`,
                  color: 'var(--clr-success)',
                  bg: '#d1fae5',
                },
                {
                  label: 'Outstanding',
                  value: `₦${(totals.outstanding || 0).toLocaleString()}`,
                  color: 'var(--clr-warning)',
                  bg: '#fef3c7',
                },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 'var(--radius-md)',
                    background: s.bg,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: s.color,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: '1.375rem',
                      color: s.color,
                    }}
                  >
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Fees, each with its own split-payment progress ─────────── */}
          {arrears.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card__header">
                <h3 className="card__title">Earlier balances</h3>
                <span style={{ color: 'var(--clr-danger)', fontWeight: 600 }}>
                  ₦{arrearsTotal.toLocaleString()} still owed
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fill, minmax(min(300px, 100%), 1fr))',
                  gap: 16,
                }}
              >
                {arrears.map((balance) => (
                  <FeeBalanceCard
                    key={balance.feeStructure._id}
                    balance={balance}
                    paying={paying === balance.feeStructure._id}
                    canPayOnline={canPayOnline}
                    onPay={(amount) => handlePaystack(balance.feeStructure, amount)}
                  />
                ))}
              </div>
            </div>
          )}

          {balances.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: 'var(--clr-text-2)',
                  marginBottom: 14,
                }}
              >
                {term} Fee Structure — {selectedChild?.firstName}
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))',
                  gap: 16,
                }}
              >
                {balances.map((balance) => (
                  <FeeBalanceCard
                    key={balance.feeStructure._id}
                    balance={balance}
                    paying={paying === balance.feeStructure._id}
                    canPayOnline={canPayOnline}
                    onPay={(amount) =>
                      handlePaystack(balance.feeStructure, amount)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── No fee structures for this class/term ─────────────────── */}
          {balances.length === 0 && !loading && (
            <div className="card" style={{ marginBottom: 28 }}>
              <div className="empty-state" style={{ padding: '40px 24px' }}>
                <CreditCard size={40} className="empty-state__icon" />
                <p className="empty-state__title">No fee structures yet</p>
                <p className="empty-state__text">
                  No fees have been configured for {selectedChild?.firstName}'s
                  class in {term} ({academicYear}).
                </p>
              </div>
            </div>
          )}

          {/* ── Payment history ───────────────────────────────────────── */}
          <div className="card">
            <div className="card__header">
              <span className="card__title">
                Payment History — {selectedChild?.firstName}{' '}
                {selectedChild?.lastName}
              </span>
              <span
                style={{ fontSize: '0.875rem', color: 'var(--clr-text-3)' }}
              >
                {payments.length} record{payments.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div
              className="table-wrapper"
              style={{ border: 'none', borderRadius: 0 }}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th>Fee</th>
                    <th>Amount Paid</th>
                    <th>Status</th>
                    <th>Gateway</th>
                    <th>Receipt No.</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          textAlign: 'center',
                          padding: '40px 16px',
                          color: 'var(--clr-text-3)',
                        }}
                      >
                        No payment records for this term
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p._id}>
                        <td style={{ fontWeight: 500 }}>
                          {p.feeStructure?.title || '—'}
                        </td>
                        <td
                          style={{
                            fontWeight: 700,
                            color: 'var(--clr-success)',
                          }}
                        >
                          ₦{(p.amountPaid || 0).toLocaleString()}
                        </td>
                        <td>
                          <span
                            className={`badge badge--${STATUS_BADGE[p.status] || 'neutral'}`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td
                          style={{
                            fontSize: '0.875rem',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          {p.gateway || '—'}
                        </td>
                        <td
                          style={{
                            fontSize: '0.8125rem',
                            fontFamily: 'var(--font-display)',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          {receiptLabel(p)}
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
        </>
      )}
    </>
  );
}
