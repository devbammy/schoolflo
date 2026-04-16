import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false, loading = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || 'Confirm Action'}
      maxWidth={420}
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className={`btn btn--${danger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: danger ? '#fee2e2' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={20} color={danger ? '#dc2626' : '#2563eb'} />
        </div>
        <p style={{ color: 'var(--clr-text-2)', lineHeight: 1.6, margin: 0 }}>{message}</p>
      </div>
    </Modal>
  );
}
