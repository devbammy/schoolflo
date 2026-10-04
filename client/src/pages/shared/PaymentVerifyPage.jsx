import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { paymentService } from '../../services/api';
import useAuthStore from '../../store/authStore';

const HOME = {
  Admin: '/admin/payments',
  Student: '/student/payments',
  Parent: '/parent/payments',
};

/**
 * Where Paystack and Flutterwave send the payer once they have paid (or
 * given up). Nothing handled this URL before, so every payer landed on the 404
 * page and settlement depended entirely on the webhook arriving.
 *
 * The two gateways name the reference differently: Paystack sends `reference`
 * and `trxref`, Flutterwave sends `tx_ref`. The server settles by reference
 * whichever gateway the payment was raised with, so one endpoint serves both.
 * Settlement is idempotent — if the webhook got there first this simply
 * reports the payment as already confirmed.
 */
export default function PaymentVerifyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const [state, setState] = useState('checking'); // checking | done | pending | cancelled | invalid
  const [message, setMessage] = useState('');
  const started = useRef(false);

  const reference =
    params.get('reference') || params.get('trxref') || params.get('tx_ref');
  const gatewayStatus = (params.get('status') || '').toLowerCase();
  const home = HOME[role] || '/';

  useEffect(() => {
    // StrictMode runs effects twice in development; one check is enough.
    if (started.current) return;
    started.current = true;

    if (!reference) {
      setState('invalid');
      return;
    }

    if (gatewayStatus === 'cancelled') {
      setState('cancelled');
      return;
    }

    paymentService
      .verifyPaystack(reference)
      .then(() => {
        setState('done');
        toast.success('Payment confirmed');
        setTimeout(() => navigate(home, { replace: true }), 1500);
      })
      .catch((err) => {
        setState('pending');
        setMessage(err.response?.data?.message || '');
      });
  }, [reference, gatewayStatus, home, navigate]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 16,
        padding: 24,
        textAlign: 'center',
      }}
    >
      {state === 'checking' && (
        <>
          <div className="spinner" />
          <h2>Confirming your payment…</h2>
          <p>Please don&apos;t close this page.</p>
        </>
      )}

      {state === 'done' && (
        <>
          <h2>Payment confirmed</h2>
          <p>Taking you back to your payments…</p>
        </>
      )}

      {state === 'pending' && (
        <>
          <h2>We couldn&apos;t confirm this payment yet</h2>
          <p>
            {message ||
              'The bank may still be processing it.'}{' '}
            If you were charged, it will appear on your payments page shortly
            and a receipt will be emailed to you. Please don&apos;t pay again
            until you have checked.
          </p>
          <Link to={home} className="btn btn--primary">
            Go to my payments
          </Link>
        </>
      )}

      {state === 'cancelled' && (
        <>
          <h2>Payment cancelled</h2>
          <p>You were not charged.</p>
          <Link to={home} className="btn btn--primary">
            Back to payments
          </Link>
        </>
      )}

      {state === 'invalid' && (
        <>
          <h2>Nothing to confirm</h2>
          <p>This link is missing its payment reference.</p>
          <Link to={home} className="btn btn--primary">
            Go to my payments
          </Link>
        </>
      )}
    </div>
  );
}
