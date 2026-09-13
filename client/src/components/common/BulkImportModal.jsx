import React, { useCallback, useRef, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
  ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import api, { userService } from '../../services/api';

/**
 * Import accounts from a spreadsheet, in three steps: choose a file, read what
 * the server says it would do, then commit.
 *
 * The middle step is the point. A file of two hundred students will have a
 * malformed date somewhere in it, and finding that out after half the accounts
 * exist is much worse than finding out before any of them do. Nothing is
 * written until the admin has seen the verdict on every row.
 */

const STEP = { CHOOSE: 'choose', REVIEW: 'review', DONE: 'done' };

const Pill = ({ tone, children }) => (
  <span
    className={`badge badge--${tone}`}
    style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
  >
    {children}
  </span>
);

export default function BulkImportModal({ open, onClose, role, onImported }) {
  const [step, setStep] = useState(STEP.CHOOSE);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const label = role.toLowerCase();

  const reset = useCallback(() => {
    setStep(STEP.CHOOSE);
    setFile(null);
    setPreview(null);
    setResult(null);
    setBusy(false);
    setDragging(false);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const downloadTemplate = async () => {
    try {
      // Fetched through the api instance so the request carries the bearer
      // token; a plain <a href> would hit the route unauthenticated.
      const res = await api.get('/users/import/template', {
        params: { role },
        responseType: 'blob',
      });

      const url = URL.createObjectURL(
        new Blob([res.data], { type: 'text/csv' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `schoolflo-${label}-import-template.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download the template');
    }
  };

  const check = async (chosen) => {
    if (!chosen) return;

    setFile(chosen);
    setBusy(true);

    try {
      const { data } = await userService.importPreview(chosen, role);
      setPreview(data.data);
      setStep(STEP.REVIEW);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not read that file');
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    const rows = preview.rows.filter((r) => r.valid).map((r) => r.raw);

    setBusy(true);
    try {
      const { data } = await userService.importCommit(rows, role);
      setResult(data.data);
      setStep(STEP.DONE);
      if (data.data.summary.created > 0) onImported?.();
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'The import did not go through',
      );
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    check(e.dataTransfer.files?.[0]);
  };

  // ── Step 1: choose a file ────────────────────────────────────────────────
  const chooseStep = (
    <>
      <p
        style={{
          marginTop: 0,
          color: 'var(--clr-text-2)',
          fontSize: '0.875rem',
        }}
      >
        Upload a CSV of {label} records. Nothing is created until you have seen
        what the file contains.
      </p>

      <button
        className="btn btn--ghost btn--sm"
        onClick={downloadTemplate}
        style={{ marginBottom: 16 }}
      >
        <Download size={14} /> Download the {label} template
      </button>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        style={{
          border: `2px dashed ${dragging ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
          background: dragging ? 'var(--clr-bg)' : 'transparent',
          borderRadius: 'var(--radius-md)',
          padding: '32px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color .15s, background .15s',
        }}
      >
        <FileSpreadsheet
          size={28}
          style={{ color: 'var(--clr-text-3)', marginBottom: 8 }}
        />
        <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
          {busy ? 'Checking…' : 'Drop a .csv here, or click to choose'}
        </div>
        <div
          style={{
            fontSize: '0.8125rem',
            color: 'var(--clr-text-3)',
            marginTop: 4,
          }}
        >
          Up to 1,000 rows
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          check(e.target.files?.[0]);
          // Let the same file be chosen again after a failed attempt.
          e.target.value = '';
        }}
      />
    </>
  );

  // ── Step 2: what the server would do ─────────────────────────────────────
  const reviewStep = preview && (
    <>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <strong style={{ fontSize: '0.9375rem' }}>{file?.name}</strong>
        <Pill tone="success">{preview.summary.valid} ready</Pill>
        {preview.summary.invalid > 0 && (
          <Pill tone="danger">{preview.summary.invalid} rejected</Pill>
        )}
      </div>

      {preview.summary.valid === 0 && (
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--clr-danger)',
            marginTop: 0,
          }}
        >
          No row in this file can be imported. Fix the problems below and upload
          it again.
        </p>
      )}

      <div
        className="table-wrapper"
        style={{ maxHeight: 340, overflowY: 'auto' }}
      >
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 56 }}>Row</th>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.line}>
                <td style={{ color: 'var(--clr-text-3)' }}>{row.line}</td>
                <td>
                  {`${row.user.firstName} ${row.user.lastName}`.trim() || '—'}
                </td>
                <td
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--clr-text-2)',
                    wordBreak: 'break-all',
                  }}
                >
                  {row.user.email || '—'}
                </td>
                <td>
                  {row.valid ? (
                    <Pill tone="success">Ready</Pill>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--clr-danger)',
                        lineHeight: 1.45,
                      }}
                    >
                      {row.errors.join('; ')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p
        style={{
          fontSize: '0.8125rem',
          color: 'var(--clr-text-3)',
          marginBottom: 0,
        }}
      >
        Each new account gets its own password, sent to them by email. Rejected
        rows are skipped — nothing about them is created.
      </p>
    </>
  );

  // ── Step 3: what actually happened ───────────────────────────────────────
  const doneStep = result && (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {result.summary.created > 0 ? (
          <CheckCircle2
            size={20}
            style={{ color: 'var(--clr-success)', flexShrink: 0 }}
          />
        ) : (
          <AlertTriangle
            size={20}
            style={{ color: 'var(--clr-warning)', flexShrink: 0 }}
          />
        )}
        <div>
          <div style={{ fontWeight: 600 }}>
            {result.summary.created} {label} account
            {result.summary.created === 1 ? '' : 's'} created
          </div>
          <div
            style={{
              fontSize: '0.8125rem',
              color: 'var(--clr-text-3)',
              marginTop: 2,
            }}
          >
            Each one has been emailed their password.
          </div>
        </div>
      </div>

      {result.failed.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div
            style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}
          >
            {result.failed.length} could not be created
          </div>
          <div
            className="table-wrapper"
            style={{ maxHeight: 220, overflowY: 'auto' }}
          >
            <table className="table">
              <tbody>
                {result.failed.map((f) => (
                  <tr key={f.line}>
                    <td style={{ width: 56, color: 'var(--clr-text-3)' }}>
                      {f.line}
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>{f.email || '—'}</td>
                    <td
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--clr-danger)',
                      }}
                    >
                      {f.errors.join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  const footer =
    step === STEP.REVIEW ? (
      <>
        <button className="btn btn--secondary" onClick={reset} disabled={busy}>
          <ArrowLeft size={14} /> Choose another file
        </button>
        <button
          className="btn btn--primary"
          onClick={commit}
          disabled={busy || preview?.summary.valid === 0}
        >
          <Upload size={14} />
          {busy
            ? 'Importing…'
            : `Import ${preview?.summary.valid ?? 0} ${label}${
                preview?.summary.valid === 1 ? '' : 's'
              }`}
        </button>
      </>
    ) : step === STEP.DONE ? (
      <button className="btn btn--primary" onClick={close}>
        Done
      </button>
    ) : (
      <button className="btn btn--secondary" onClick={close}>
        Cancel
      </button>
    );

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Import ${role}s from CSV`}
      maxWidth={step === STEP.CHOOSE ? 520 : 760}
      footer={footer}
    >
      {step === STEP.CHOOSE && chooseStep}
      {step === STEP.REVIEW && reviewStep}
      {step === STEP.DONE && doneStep}
    </Modal>
  );
}
