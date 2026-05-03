import React, { useEffect, useState } from 'react';
import { CreditCard, CheckCircle, ExternalLink } from 'lucide-react';
import { paymentService, feeService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function StudentPayments() {
  const { user } = useAuthStore();
  const [payments, setPayments] = useState([]);
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null);

  const studentId = user?.studentProfile
    ? user._id
    : user?.parentProfile?.children?.[0]?._id || user?._id;

  useEffect(() => {
    Promise.all([
      paymentService.getStudentPayments(studentId),
      feeService.getAll({ term: 'First Term', academicYear: '2024/2025' }),
    ])
      .then(([pRes, fRes]) => {
        setPayments(pRes.data.data.payments || []);
        setFees(fRes.data.data?.fees || []);
      })
      .catch(() => toast.error('Failed to load payments'))
      .finally(() => setLoading(false));
  }, [studentId]);

  const handlePaystack = async (fee) => {
    setPaying(fee._id);
    try {
      const res = await paymentService.initPaystack({
        studentId,
        feeStructureId: fee._id,
        amount: fee.totalAmount,
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

      {fees.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3
            style={{
              marginBottom: 16,
              fontSize: '1rem',
              color: 'var(--clr-text-2)',
            }}
          >
            Outstanding Fees
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {fees.map((fee) => {
              const paid = payments.find(
                (p) => p.feeStructure?._id === fee._id && p.status === 'Paid',
              );
              return (
                <div key={fee._id} className="card">
                  <div className="card__body">
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
                            fontSize: '0.875rem',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          {fee.term} • {fee.academicYear}
                        </div>
                      </div>
                      {paid ? (
                        <span className="badge badge--success">
                          <CheckCircle size={12} /> Paid
                        </span>
                      ) : (
                        <span className="badge badge--warning">Unpaid</span>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.75rem',
                        fontWeight: 800,
                        color: 'var(--clr-text-1)',
                        marginBottom: 16,
                      }}
                    >
                      ₦{fee.totalAmount.toLocaleString()}
                    </div>
                    {fee.items?.map((item) => (
                      <div
                        key={item.label}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.8125rem',
                          color: 'var(--clr-text-3)',
                          marginBottom: 4,
                        }}
                      >
                        <span>{item.label}</span>
                        <span>₦{item.amount.toLocaleString()}</span>
                      </div>
                    ))}
                    {!paid && (
                      <button
                        className="btn btn--primary btn--full"
                        style={{ marginTop: 16 }}
                        onClick={() => handlePaystack(fee)}
                        disabled={paying === fee._id}
                      >
                        <CreditCard size={15} />{' '}
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
