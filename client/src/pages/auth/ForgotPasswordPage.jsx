import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../../services/api';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setSent(true);
      toast.success('Reset link sent to your email');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Request failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--clr-bg)' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: 'var(--space-8)' }}>
        <h2 style={{ marginBottom: 8 }}>Forgot Password</h2>
        {sent ? (
          <div><p>Check your email for a reset link.</p><Link to="/login" className="btn btn--primary" style={{ marginTop: 16, display: 'inline-flex' }}>Back to Login</Link></div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* A reset link needs a mailbox. A student who signs in with an
                admission number has none, so the office issues a new slip. */}
            <p style={{ color: 'var(--clr-text-3)', fontSize: '0.875rem', marginTop: 0 }}>
              Sign in with an admission number? There is no email to send a link to: ask the school office for a new login slip.
            </p>
            <div className="form-group"><label>Email Address</label><input type="email" className="form-control" required value={email} onChange={e => setEmail(e.target.value)} /></div>
            <button type="submit" className="btn btn--primary btn--full" disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</button>
            <div style={{ marginTop: 16, textAlign: 'center' }}><Link to="/login" style={{ color: 'var(--clr-primary)', fontSize: '0.875rem' }}>Back to Login</Link></div>
          </form>
        )}
      </div>
    </div>
  );
}
