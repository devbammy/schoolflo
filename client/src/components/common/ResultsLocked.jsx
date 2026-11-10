import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, Wallet } from 'lucide-react';
import useAuthStore from '../../store/authStore';

/**
 * What a family sees in place of a result held back over fees.
 *
 * The server decides (services/resultAccessService.js) and answers 402 with
 * the term, the balance and the fees behind it. This only shows that, with a
 * way to the fee page: a dead "access denied" would leave a parent not knowing
 * whether the result exists at all, or what to do about it.
 */

/** The lock details from a failed request, or null if it is not a lock. */
export const lockFromError = (err) => {
  const details = err?.response?.data?.errors;
  return err?.response?.status === 402 && details?.reason === 'FEES_OUTSTANDING'
    ? details
    : null;
};

const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

export default function ResultsLocked({ lock, compact = false }) {
  const role = useAuthStore((s) => s.user?.role);
  if (!lock) return null;

  const feesPage = role === 'Parent' ? '/parent/payments' : '/student/payments';
  const when = [lock.term, lock.academicYear].filter(Boolean).join(' ');

  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          fontSize: '0.875rem',
          color: 'var(--clr-text-2)',
        }}
      >
        <Lock
          size={16}
          style={{ color: 'var(--clr-warning)', flexShrink: 0, marginTop: 2 }}
        />
        <span style={{ minWidth: 0 }}>
          {when ? `${when} results are` : 'Results are'} available once fees are
          paid in full. <strong>{naira(lock.outstanding)}</strong> is
          outstanding. <Link to={feesPage}>See fees</Link>
        </span>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="empty-state">
        <Lock
          size={44}
          className="empty-state__icon"
          style={{ color: 'var(--clr-warning)' }}
        />
        <p className="empty-state__title">Results available after payment</p>
        <p className="empty-state__text">
          {when ? `${when} results have` : 'These results have'} been published,
          and can be viewed and printed once school fees are paid in full.
        </p>

        {lock.fees?.length > 0 && (
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              margin: '16px auto 0',
              textAlign: 'left',
              border: '1px solid var(--clr-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {lock.fees.map((fee) => (
              <div
                key={fee.feeStructure}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--clr-border)',
                  fontSize: '0.875rem',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  {fee.title}
                  <span style={{ color: 'var(--clr-text-3)' }}>
                    {' '}
                    · {fee.term} {fee.academicYear}
                  </span>
                </span>
                <strong style={{ whiteSpace: 'nowrap' }}>
                  {naira(fee.outstanding)}
                </strong>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                fontWeight: 700,
              }}
            >
              <span>Outstanding</span>
              <span style={{ whiteSpace: 'nowrap' }}>
                {naira(lock.outstanding)}
              </span>
            </div>
          </div>
        )}

        <Link
          to={feesPage}
          className="btn btn--primary"
          style={{ marginTop: 20, display: 'inline-flex' }}
        >
          <Wallet size={16} /> See fees
        </Link>
      </div>
    </div>
  );
}
