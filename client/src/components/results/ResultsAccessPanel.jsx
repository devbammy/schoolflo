import React, { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { userService } from '../../services/api';
import ConfirmDialog from '../common/ConfirmDialog';

/**
 * The admin's view of a student's results lock, on the student's profile.
 *
 * Shown only at a school that withholds results over unpaid fees. It says
 * whether this student is locked out, over which fees, and lets an admin make
 * an exception (a scholarship, an agreed payment plan) or withdraw one. The
 * exception is recorded in the audit log against the student, with who made
 * it. Without this, the office's only way to release a report card was to
 * record a payment that never happened.
 */

const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

export default function ResultsAccessPanel({ studentId, access, onChange }) {
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(null); // 'release' | 'lock'
  const [saving, setSaving] = useState(false);

  if (!access?.enforced) return null;

  const save = async () => {
    setSaving(true);
    try {
      const res = await userService.setResultsRelease(studentId, {
        release: confirming === 'release',
        note: confirming === 'release' ? note.trim() : undefined,
      });
      toast.success(res.data.message);
      onChange?.(res.data.data.resultsAccess);
      setNote('');
      setConfirming(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not change access');
    } finally {
      setSaving(false);
    }
  };

  const owes = !access.released && access.outstanding > 0;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card__header">
        <h3
          className="card__title"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {owes ? <Lock size={16} /> : <Unlock size={16} />} Results access
        </h3>
        <span
          className={`badge badge--${
            access.released ? 'info' : owes ? 'warning' : 'success'
          }`}
        >
          {access.released
            ? 'Released by admin'
            : owes
              ? 'Locked over fees'
              : 'Open'}
        </span>
      </div>
      <div className="card__body" style={{ fontSize: '0.875rem' }}>
        {access.released ? (
          <>
            <p style={{ marginTop: 0 }}>
              This student and their parents can see every result, whatever is
              owed.
              {access.releasedBy && ` Released by ${access.releasedBy}`}
              {access.releasedAt &&
                ` on ${format(new Date(access.releasedAt), 'dd MMM yyyy')}`}
              .
            </p>
            {access.note && (
              <p style={{ color: 'var(--clr-text-2)' }}>
                Reason: <em>{access.note}</em>
              </p>
            )}
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => setConfirming('lock')}
            >
              <Lock size={14} /> Lock again until fees are paid
            </button>
          </>
        ) : owes ? (
          <>
            <p style={{ marginTop: 0 }}>
              Results from the earliest unpaid term onwards are hidden from this
              student and their parents until{' '}
              <strong>{naira(access.outstanding)}</strong> is paid:
            </p>
            <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
              {access.unpaid.map((fee) => (
                <li key={fee.feeStructure}>
                  {fee.title} ({fee.term} {fee.academicYear}):{' '}
                  {naira(fee.outstanding)}
                </li>
              ))}
            </ul>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <input
                className="form-control"
                style={{ flex: '1 1 220px', minWidth: 0 }}
                placeholder="Reason, e.g. scholarship or payment plan (optional)"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                className="btn btn--primary btn--sm"
                onClick={() => setConfirming('release')}
              >
                <Unlock size={14} /> Release results anyway
              </button>
            </div>
          </>
        ) : (
          <p style={{ margin: 0 }}>
            Fees are up to date, so every published result is visible.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        onConfirm={save}
        title={
          confirming === 'release'
            ? 'Release results despite the balance?'
            : 'Lock results again?'
        }
        message={
          confirming === 'release'
            ? 'The student and their parents will be able to see and print every result, although fees are not complete. This is recorded in the audit log with your name.'
            : 'Results will be hidden again from the earliest unpaid term onwards, until the balance is paid.'
        }
        confirmLabel={confirming === 'release' ? 'Release' : 'Lock again'}
        loading={saving}
      />
    </div>
  );
}
