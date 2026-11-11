import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Scale } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { userService } from '../../services/api';
import ConfirmDialog from '../common/ConfirmDialog';

/**
 * An admin's control over whether one student's results are shown to the
 * student and their parents. Available for every student.
 *
 *   Automatic   the school rule: shown, or held until fees are paid where
 *               the school locks results over fees
 *   Always show shown whatever is owed (scholarship, payment plan)
 *   Withhold    hidden whatever is paid (a matter the school is settling)
 *
 * Every change is recorded in the audit log against the student, with who
 * made it. The note is for the office: the family is never shown it.
 *
 * Used on the student's profile (given `access` from the profile) and from the
 * Students list (no `access`: it loads its own).
 */

const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

const CHOICES = [
  {
    mode: 'auto',
    icon: Scale,
    label: 'Automatic',
    hint: 'Follow the school rule',
  },
  {
    mode: 'open',
    icon: Eye,
    label: 'Always show',
    hint: 'Even with fees outstanding',
  },
  {
    mode: 'withheld',
    icon: EyeOff,
    label: 'Withhold',
    hint: 'Even when fees are paid',
  },
];

const CONFIRM = {
  auto: {
    title: 'Return to the school rule?',
    message:
      'Results will be shown or held according to the school rule, including whether fees are paid.',
  },
  open: {
    title: 'Always show results?',
    message:
      'The student and their parents will be able to see and print every published result, whatever is owed. This is recorded in the audit log with your name.',
  },
  withheld: {
    title: 'Withhold results?',
    message:
      'The student and their parents will not be able to see or print any result, even when fees are paid. They will be asked to contact the school office. This is recorded in the audit log with your name.',
  },
};

export default function ResultsAccessPanel({
  studentId,
  access: given,
  onChange,
  bare = false,
}) {
  const [access, setAccess] = useState(given || null);
  const [choice, setChoice] = useState(given?.mode || 'auto');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  // Loaded here when the caller has not already got it (the Students list).
  useEffect(() => {
    if (given) {
      setAccess(given);
      setChoice(given.mode);
      return;
    }
    let live = true;
    userService
      .getResultsAccess(studentId)
      .then((res) => {
        if (!live) return;
        setAccess(res.data.data.resultsAccess);
        setChoice(res.data.data.resultsAccess.mode);
      })
      .catch(() => toast.error('Could not load results access'));
    return () => {
      live = false;
    };
  }, [studentId, given]);

  if (!access) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <span className="spinner" />
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const res = await userService.setResultsAccess(studentId, {
        mode: choice,
        note: choice === 'auto' ? undefined : note.trim() || undefined,
      });
      const next = res.data.data.resultsAccess;
      toast.success(res.data.message);
      setAccess(next);
      setNote('');
      setConfirming(false);
      onChange?.(next);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not change access');
    } finally {
      setSaving(false);
    }
  };

  // Where things stand now, in one sentence the admin can act on.
  const status = (() => {
    if (access.mode === 'withheld') return 'Withheld by the school';
    if (access.mode === 'open') return 'Shown, whatever is owed';
    if (!access.feeRule) return 'Shown';
    return access.outstanding > 0
      ? `Held from the earliest unpaid term: ${naira(access.outstanding)} owed`
      : 'Shown: fees are up to date';
  })();

  const body = (
    <>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 14,
          fontSize: '0.875rem',
        }}
      >
        <span
          className={`badge badge--${
            access.visible
              ? 'success'
              : access.mode === 'withheld'
                ? 'danger'
                : 'warning'
          }`}
        >
          {access.visible ? 'Visible' : 'Hidden'}
        </span>
        <span style={{ minWidth: 0 }}>{status}</span>
      </div>

      {access.mode !== 'auto' && (access.setBy || access.note) && (
        <p
          style={{
            marginTop: 0,
            fontSize: '0.8125rem',
            color: 'var(--clr-text-3)',
          }}
        >
          Set
          {access.setBy && ` by ${access.setBy}`}
          {access.setAt &&
            ` on ${format(new Date(access.setAt), 'dd MMM yyyy')}`}
          {access.note && (
            <>
              {' '}
              · Reason: <em>{access.note}</em>
            </>
          )}
        </p>
      )}

      {access.feeRule && access.unpaid?.length > 0 && (
        <ul
          style={{
            margin: '0 0 14px',
            paddingLeft: 18,
            fontSize: '0.8125rem',
            color: 'var(--clr-text-2)',
          }}
        >
          {access.unpaid.map((fee) => (
            <li key={fee.feeStructure}>
              {fee.title} ({fee.term} {fee.academicYear}):{' '}
              {naira(fee.outstanding)}
            </li>
          ))}
        </ul>
      )}

      <div
        role="radiogroup"
        aria-label="Results access"
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(150px, 100%), 1fr))',
          gap: 8,
          marginBottom: 12,
        }}
      >
        {CHOICES.map(({ mode, icon: Icon, label, hint }) => {
          const on = choice === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChoice(mode)}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: `${on ? 2 : 1}px solid ${
                  on ? 'var(--clr-primary)' : 'var(--clr-border)'
                }`,
                background: on ? 'var(--clr-surface-2)' : 'transparent',
                cursor: 'pointer',
                minWidth: 0,
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: 'var(--clr-text-1)',
                }}
              >
                <Icon size={14} /> {label}
                {access.mode === mode && (
                  <span
                    style={{
                      fontWeight: 400,
                      fontSize: '0.75rem',
                      color: 'var(--clr-text-3)',
                    }}
                  >
                    (current)
                  </span>
                )}
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  color: 'var(--clr-text-3)',
                  marginTop: 2,
                }}
              >
                {hint}
              </span>
            </button>
          );
        })}
      </div>

      {choice !== 'auto' && (
        <input
          className="form-control"
          style={{ marginBottom: 12 }}
          placeholder={
            choice === 'open'
              ? 'Reason, e.g. scholarship or payment plan (optional)'
              : 'Reason, for the office only (optional)'
          }
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}

      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={choice === access.mode && !note.trim()}
        onClick={() => setConfirming(true)}
      >
        <Lock size={14} /> Save
      </button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={save}
        title={CONFIRM[choice].title}
        message={CONFIRM[choice].message}
        confirmLabel="Save"
        danger={choice === 'withheld'}
        loading={saving}
      />
    </>
  );

  if (bare) return body;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card__header">
        <h3
          className="card__title"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Lock size={16} /> Results access
        </h3>
      </div>
      <div className="card__body" style={{ fontSize: '0.875rem' }}>
        {body}
      </div>
    </div>
  );
}
