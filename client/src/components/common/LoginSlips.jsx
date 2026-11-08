import React, { useMemo, useRef } from 'react';
import { Printer } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import useFeatureStore from '../../store/featureStore';
import './LoginSlips.scss';

/**
 * Sign-in details for students who have no email, printed to be cut up and
 * handed out by form teachers.
 *
 * The passwords exist only in the response that created them and in this
 * component's props. The server keeps a hash and nothing else, so once this is
 * closed the only way to a password is a new slip (which replaces it).
 *
 * Sorted by class then name, so the sheet comes off the printer already in
 * the piles each form teacher will take.
 */

// The timetable's stylesheet sets A4 landscape for every print. A column of
// slips wants portrait, and react-to-print lets this print say so.
const PAGE_STYLE = `
  @page { size: A4 portrait; margin: 10mm; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

const byClassThenName = (a, b) =>
  String(a.className || '').localeCompare(String(b.className || ''), 'en', {
    numeric: true,
  }) ||
  String(a.lastName).localeCompare(String(b.lastName), 'en') ||
  String(a.firstName).localeCompare(String(b.firstName), 'en');

export default function LoginSlips({
  slips,
  onPrinted,
  buttonLabel = 'Print login slips',
}) {
  const ref = useRef(null);
  const schoolName = useFeatureStore((s) => s.school?.name);
  const loginUrl = `${window.location.origin}/login`;

  const sorted = useMemo(() => [...slips].sort(byClassThenName), [slips]);

  const handlePrint = useReactToPrint({
    contentRef: ref,
    documentTitle: 'Student login slips',
    pageStyle: PAGE_STYLE,
    onAfterPrint: onPrinted,
  });

  if (!sorted.length) return null;

  return (
    <div className="login-slips">
      <div className="table-wrapper login-slips__preview">
        <table className="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th>Admission no.</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.admissionNumber}>
                <td>{`${s.firstName} ${s.lastName}`}</td>
                <td>{s.className || '—'}</td>
                <td className="login-slips__code">{s.admissionNumber}</td>
                <td className="login-slips__code">{s.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="btn btn--primary btn--sm"
        onClick={handlePrint}
      >
        <Printer size={14} /> {buttonLabel}
      </button>

      {/* Off-screen rather than display:none: react-to-print clones the node,
          and one that was never laid out prints with no widths. */}
      <div className="login-slips__offscreen" aria-hidden="true">
        <div className="slip-sheet" ref={ref}>
          {sorted.map((s) => (
            <section className="slip" key={s.admissionNumber}>
              <header className="slip__head">
                <span className="slip__school">
                  {schoolName || 'School portal'}
                </span>
                <span className="slip__class">{s.className || ''}</span>
              </header>

              <div className="slip__name">{`${s.firstName} ${s.lastName}`}</div>

              <dl className="slip__creds">
                <div>
                  <dt>Admission number</dt>
                  <dd>{s.admissionNumber}</dd>
                </div>
                <div>
                  <dt>Password</dt>
                  <dd>{s.password}</dd>
                </div>
              </dl>

              <p className="slip__how">
                Sign in at <strong>{loginUrl}</strong> with your admission
                number and this password. You can change the password any time:
                open the menu under your name and choose{' '}
                <strong>Change password</strong>. Keep this slip private.
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
