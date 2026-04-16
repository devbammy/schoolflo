import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authService } from '../../services/api';
import toast from 'react-hot-toast';

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      toast.success('Password reset successfully');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--clr-bg)' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: 'var(--space-8)' }}>
        <h2 style={{ marginBottom: 16 }}>Reset Password</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>New Password</label><input type="password" className="form-control" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /></div>
          <button type="submit" className="btn btn--primary btn--full" disabled={loading}>{loading ? 'Resetting...' : 'Reset Password'}</button>
        </form>
      </div>
    </div>
  );
}
