import React, { useCallback, useEffect, useState } from 'react';
import { paymentService } from '../../services/api';
import FeeBalanceCard from '../../components/payments/FeeBalanceCard';
import useAuthStore from '../../store/authStore';
import { useFeature } from '../../store/featureStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  getCurrentAcademicYear,
  generateAcademicYearOptions,
} from '../../utils/academicYear';

const TERMS = ['First Term', 'Second Term', 'Third Term'];

export default function StudentPayments() {
  const { user } = useAuthStore();
  const canPayOnline = useFeature('onlinePayments');
  const [term, setTerm] = useState('First Term');
  const [payments, setPayments] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());

  const studentId = user?.studentProfile
    ? user._id
    : user?.parentProfile?.children?.[0]?._id || user?._id;

  const load = useCallback(() => {
    if (!studentId) return;

    Promise.all([
      paymentService.getStudentPayments(studentId, { term, academicYear }),
      paymentService.getBalances(studentId, { term, academicYear }),
    ])
      .then(([pRes, bRes]) => {
        setPayments(pRes.data.data?.payments || []);
        setBalances(bRes.data.data?.balances || []);
      })
      .catch(() => toast.error('Failed to load payments'))
      .finally(() => setLoading(false));
  }, [studentId, term, academicYear]);

  useEffect(load, [load]);

  // The gateway opens in another tab; returning to this one is when a
  // part-payment has most likely just gone through.
  useEffect(() => {
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  const handlePaystack = async (fee, amount) => {
    setPaying(fee._id);
    try {
      // `amount` is only a request. The server re-checks it against what the
      // fee actually still owes before handing anything to the gateway.
      const res = await paymentService.initPaystack({
        studentId,
        feeStructureId: fee._id,
        amount,
      });
      window.open(res.data.data.authorizationUrl, '_blank');
      toast.success('Redirecting to payment gateway...');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment init failed');
    } finally {
      setPaying(null);
    }
  };

  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Fee Payments</h1>
          <p className="page-header__subtitle">Manage school fee payments</p>
        </div>
      </div>

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

      {balances.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3
            style={{
              marginBottom: 16,
              fontSize: '1rem',
              color: 'var(--clr-text-2)',
            }}
          >
            Your Fees
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {balances.map((balance) => (
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

      {/* Payment History */}
      <div className="card">
        <div className="card__header">
          <span className="card__title">Payment History</span>
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
                <th>Receipt</th>
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
                      padding: 40,
                      color: 'var(--clr-text-3)',
                    }}
                  >
                    No payment records
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p._id}>
                    <td style={{ fontWeight: 500 }}>
                      {p.feeStructure?.title || '—'}
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      ₦{(p.amountPaid || 0).toLocaleString()}
                    </td>
                    <td>
                      <span
                        className={`badge badge--${p.status === 'Paid' ? 'success' : p.status === 'Partial' ? 'info' : 'warning'}`}
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
                      {p.gateway}
                    </td>
                    <td
                      style={{
                        fontSize: '0.8125rem',
                        fontFamily: 'var(--font-display)',
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
  );
}
