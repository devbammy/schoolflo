import React, { useEffect, useState } from 'react';
import { CreditCard, CheckCircle, Users, ChevronDown } from 'lucide-react';
import { paymentService, feeService } from '../../services/api';
import useAuthStore from '../../store/authStore';
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

  // Normalise children — populated objects or bare IDs
  const rawChildren = user?.parentProfile?.children || [];
  const children = rawChildren.filter(
    (c) => c && typeof c === 'object' && c._id,
  );

  const [selectedChild, setSelectedChild] = useState(null);
  const [term, setTerm] = useState('First Term');
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [fees, setFees] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(null);

  // Auto-select first child on mount
  useEffect(() => {
    if (children.length > 0 && !selectedChild) {
      setSelectedChild(children[0]);
    }
  }, [children.length]);

  // Load fees + payments whenever child / term / year changes
  useEffect(() => {
    if (!selectedChild?._id) return;

    setLoading(true);
    setFees([]);
    setPayments([]);

    const childClassId =
      selectedChild.studentProfile?.class?._id ||
      selectedChild.studentProfile?.class;

    Promise.all([
      paymentService.getStudentPayments(selectedChild._id, {
        term,
        academicYear,
      }),
      feeService.getAll({
        term,
        academicYear,
        ...(childClassId ? { classId: childClassId } : {}),
      }),
    ])
      .then(([pRes, fRes]) => {
        setPayments(pRes.data.data?.payments || []);
        setFees(fRes.data.data?.fees || []);
      })
      .catch(() => toast.error('Failed to load payment data'))
      .finally(() => setLoading(false));
  }, [selectedChild?._id, term, academicYear]);

  // ── Pay via Paystack ───────────────────────────────────────────────────────
  const handlePaystack = async (fee) => {
    if (!selectedChild?._id) return;
    setPaying(fee._id);
    try {
      const res = await paymentService.initPaystack({
        studentId: selectedChild._id,
        feeStructureId: fee._id,
        amount: fee.totalAmount,
      });
      window.open(res.data.data.authorizationUrl, '_blank');
      toast.success('Redirecting to Paystack...');
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

  const isPaid = (fee) =>
    payments.some(
      (p) =>
        (p.feeStructure?._id || p.feeStructure) === fee._id &&
        p.status === 'Paid',
    );

  const totalPaid = payments.reduce((s, p) => s + (p.amountPaid || 0), 0);
  const totalOutstanding = payments.reduce((s, p) => s + (p.balance || 0), 0);

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
          {(totalPaid > 0 || totalOutstanding > 0) && (
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
                  label: 'Total Paid',
                  value: `₦${totalPaid.toLocaleString()}`,
                  color: 'var(--clr-success)',
                  bg: '#d1fae5',
                },
                {
                  label: 'Outstanding',
                  value: `₦${totalOutstanding.toLocaleString()}`,
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

          {/* ── Fee structure cards ───────────────────────────────────── */}
          {fees.length > 0 && (
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
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 16,
                }}
              >
                {fees.map((fee) => {
                  const paid = isPaid(fee);
                  return (
                    <div
                      key={fee._id}
                      className="card"
                      style={{
                        borderTop: `3px solid ${paid ? 'var(--clr-success)' : 'var(--clr-warning)'}`,
                      }}
                    >
                      <div className="card__body">
                        {/* Title + badge */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: 16,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: '1rem',
                                marginBottom: 4,
                              }}
                            >
                              {fee.title}
                            </div>
                            <div
                              style={{
                                fontSize: '0.8125rem',
                                color: 'var(--clr-text-3)',
                              }}
                            >
                              {fee.term} • {fee.academicYear}
                            </div>
                          </div>
                          {paid ? (
                            <span
                              className="badge badge--success"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <CheckCircle size={11} /> Paid
                            </span>
                          ) : (
                            <span className="badge badge--warning">Unpaid</span>
                          )}
                        </div>

                        {/* Amount */}
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '1.875rem',
                            fontWeight: 800,
                            color: 'var(--clr-text-1)',
                            marginBottom: 14,
                          }}
                        >
                          ₦{fee.totalAmount?.toLocaleString()}
                        </div>

                        {/* Line items */}
                        {(fee.items || []).map((item, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.8125rem',
                              marginBottom: 5,
                            }}
                          >
                            <span
                              style={{
                                color: 'var(--clr-text-2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              {item.label}
                              {!item.isCompulsory && (
                                <span
                                  style={{
                                    fontSize: '0.7rem',
                                    border: '1px solid var(--clr-border)',
                                    borderRadius: 4,
                                    padding: '1px 5px',
                                    color: 'var(--clr-text-3)',
                                  }}
                                >
                                  optional
                                </span>
                              )}
                            </span>
                            <span
                              style={{
                                fontWeight: 600,
                                color: 'var(--clr-text-1)',
                              }}
                            >
                              ₦{item.amount?.toLocaleString()}
                            </span>
                          </div>
                        ))}

                        {/* Due date */}
                        {fee.dueDate && (
                          <div
                            style={{
                              marginTop: 10,
                              fontSize: '0.8125rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            Due: {format(new Date(fee.dueDate), 'dd MMM yyyy')}
                            {fee.lateFee > 0 && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  color: 'var(--clr-warning)',
                                }}
                              >
                                +₦{fee.lateFee.toLocaleString()} late fee
                              </span>
                            )}
                          </div>
                        )}

                        {/* Pay button */}
                        {!paid && (
                          <button
                            className="btn btn--primary btn--full"
                            style={{
                              marginTop: 16,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                            }}
                            onClick={() => handlePaystack(fee)}
                            disabled={paying === fee._id}
                          >
                            <CreditCard size={15} />
                            {paying === fee._id
                              ? 'Processing...'
                              : 'Pay with Paystack'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── No fee structures for this class/term ─────────────────── */}
          {fees.length === 0 && !loading && (
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
                    <th>Balance</th>
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
                        colSpan={7}
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
                        <td
                          style={{
                            fontWeight: p.balance > 0 ? 600 : 400,
                            color:
                              p.balance > 0
                                ? 'var(--clr-warning)'
                                : 'var(--clr-text-3)',
                          }}
                        >
                          {p.balance > 0
                            ? `₦${p.balance.toLocaleString()}`
                            : '—'}
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
        </>
      )}
    </>
  );
}
