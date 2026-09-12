import React, { useEffect, useState } from 'react';
import { CreditCard, CheckCircle, Banknote, Wallet } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_BADGE = {
  Paid: 'success',
  Partial: 'info',
  Pending: 'warning',
  Overdue: 'danger',
};

const naira = (value) => `₦${Number(value || 0).toLocaleString()}`;

/**
 * One fee, and how far along it is.
 *
 * A fee does not have to be settled in a single go: a family can send part of
 * it through the gateway now and hand the rest over at the school office, in
 * any order and over as many instalments as they need. So the card is built
 * around the fee's balance rather than around any one transaction — the bar
 * shows both channels side by side, and the amount box starts at the full
 * remainder but can be edited down to whatever is being paid today.
 *
 * `canPayOnline` is false at a school that collects fees at the office. The
 * card is still worth showing there — it is where a parent finds out what is
 * owed — but the channel split collapses to a single bar, because an "Online
 * ₦0" legend on every card is noise, and the amount box gives way to a note
 * saying where to actually pay.
 */
export default function FeeBalanceCard({
  balance,
  onPay,
  paying = false,
  canPayOnline = true,
}) {
  const fee = balance.feeStructure || {};
  const {
    totalAmount = 0,
    paidOnline = 0,
    paidOffline = 0,
    paidTotal = 0,
    outstanding = 0,
    status = 'Pending',
    minimumOnlinePayment = 0,
  } = balance;

  const settled = outstanding <= 0;
  const [amount, setAmount] = useState(String(outstanding));

  // Once an instalment lands the remainder shrinks; the box should follow it
  // rather than keep offering an amount that is no longer owed.
  useEffect(() => {
    setAmount(String(outstanding));
  }, [outstanding]);

  const requested = Math.round(Number(amount));
  const invalid =
    !Number.isFinite(requested) ||
    requested <= 0 ||
    requested > outstanding ||
    // Anything under the gateway floor is only allowed when it clears the fee.
    (requested < minimumOnlinePayment && requested !== outstanding);

  const pctOf = (value) =>
    totalAmount > 0 ? Math.min(100, (value / totalAmount) * 100) : 0;

  return (
    <div
      className="card"
      style={{
        borderTop: `3px solid ${
          settled
            ? 'var(--clr-success)'
            : status === 'Overdue'
              ? 'var(--clr-danger)'
              : 'var(--clr-warning)'
        }`,
      }}
    >
      <div className="card__body">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 14,
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
              {fee.title}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--clr-text-3)' }}>
              {fee.term} • {fee.academicYear}
            </div>
          </div>
          <span
            className={`badge badge--${STATUS_BADGE[status] || 'neutral'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {settled && <CheckCircle size={11} />}
            {status}
          </span>
        </div>

        {/* Outstanding is the number that matters; the total is context. */}
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.875rem',
              fontWeight: 800,
              color: settled ? 'var(--clr-success)' : 'var(--clr-text-1)',
              lineHeight: 1.1,
            }}
          >
            {settled ? naira(totalAmount) : naira(outstanding)}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--clr-text-3)' }}>
            {settled ? 'Fully paid' : `still to pay of ${naira(totalAmount)}`}
          </div>
        </div>

        {/* Split progress: what came in online, what came in over the counter */}
        <div
          style={{
            display: 'flex',
            height: 8,
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
            background: 'var(--clr-border)',
            marginBottom: 10,
          }}
          role="img"
          aria-label={`${naira(paidTotal)} of ${naira(totalAmount)} paid`}
        >
          {canPayOnline && (
            <div
              style={{
                width: `${pctOf(paidOnline)}%`,
                background: 'var(--clr-primary)',
              }}
            />
          )}
          <div
            style={{
              width: `${pctOf(canPayOnline ? paidOffline : paidTotal)}%`,
              background: 'var(--clr-success)',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            fontSize: '0.75rem',
            color: 'var(--clr-text-3)',
            marginBottom: 16,
          }}
        >
          {canPayOnline && (
            <span
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              title="Paid by card or transfer through the portal"
            >
              <CreditCard size={12} color="var(--clr-primary)" />
              Online {naira(paidOnline)}
            </span>
          )}
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            title="Paid in cash or by bank transfer at the school office"
          >
            <Banknote size={12} color="var(--clr-success)" />
            {canPayOnline ? 'At school ' : 'Paid '}
            {naira(canPayOnline ? paidOffline : paidTotal)}
          </span>
          {!settled && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Wallet size={12} color="var(--clr-warning)" />
              Left {naira(outstanding)}
            </span>
          )}
        </div>

        {(fee.items || []).map((item, i) => (
          <div
            key={item.label || i}
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
            <span style={{ fontWeight: 600, color: 'var(--clr-text-1)' }}>
              {naira(item.amount)}
            </span>
          </div>
        ))}

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
              <span style={{ marginLeft: 8, color: 'var(--clr-warning)' }}>
                +{naira(fee.lateFee)} late fee
              </span>
            )}
          </div>
        )}

        {!settled && !canPayOnline && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--clr-surface-2)',
              border: '1px solid var(--clr-border)',
              fontSize: '0.8125rem',
              color: 'var(--clr-text-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Banknote size={15} color="var(--clr-success)" />
            <span>
              <strong>{naira(outstanding)}</strong> outstanding — payable at the
              school office. Your receipt will appear here once it is recorded.
            </span>
          </div>
        )}

        {!settled && canPayOnline && (
          <div style={{ marginTop: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--clr-text-3)',
                marginBottom: 6,
              }}
              htmlFor={`amount-${fee._id}`}
            >
              Amount to pay now
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                id={`amount-${fee._id}`}
                type="number"
                className="form-control"
                min={1}
                max={outstanding}
                step={100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={paying}
              />
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setAmount(String(outstanding))}
                disabled={paying}
              >
                Full
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() =>
                  setAmount(String(Math.max(1, Math.round(outstanding / 2))))
                }
                disabled={paying}
              >
                Half
              </button>
            </div>

            <button
              className="btn btn--primary btn--full"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              onClick={() => onPay(requested)}
              disabled={paying || invalid}
            >
              <CreditCard size={15} />
              {paying
                ? 'Processing...'
                : `Pay ${naira(requested > 0 ? requested : 0)} online`}
            </button>

            <p
              style={{
                marginTop: 8,
                marginBottom: 0,
                fontSize: '0.75rem',
                color: 'var(--clr-text-3)',
                lineHeight: 1.5,
              }}
            >
              {invalid && requested > outstanding
                ? `That is more than the ${naira(outstanding)} still owed.`
                : invalid && requested > 0 && requested < minimumOnlinePayment
                  ? `Part-payments online start at ${naira(
                      minimumOnlinePayment,
                    )}.`
                  : `Pay any part of it now — the rest can be settled online later, or in cash at the school office.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
