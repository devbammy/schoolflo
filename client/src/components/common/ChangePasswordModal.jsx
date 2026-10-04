import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { authService } from '../../services/api';
import useAuthStore from '../../store/authStore';

const MIN_LENGTH = 8;

/**
 * Lets a signed-in user replace the password they were emailed.
 *
 * Accounts are created with a generated password that is sent in plain text,
 * and the email tells people to change it — but there was nowhere in the
 * portal to do so, so the emailed password stayed the real one indefinitely.
 */
export default function ChangePasswordModal({ open, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirm('');
    setError('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await authService.updatePassword({
        currentPassword,
        newPassword,
      });

      // The server ends every session on a password change and starts a new
      // one for this device. Keep the replacement tokens, or this tab is
      // signed out the moment its access token expires.
      useAuthStore.setState({
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
      });

      toast.success('Password changed. Other devices have been signed out.');
      close();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Change password" maxWidth={440}>
      <form onSubmit={submit}>
        <div className="form-group">
          <label>Current password</label>
          <input
            type="password"
            className="form-control"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>New password</label>
          <input
            type="password"
            className="form-control"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Confirm new password</label>
          <input
            type="password"
            className="form-control"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" style={{ color: '#dc2626', marginBottom: 12 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn--primary btn--full"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </Modal>
  );
}
