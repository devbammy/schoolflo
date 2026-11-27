import { useRef } from 'react';
import { Printer } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import useFeatureStore from '../../store/featureStore';
import api from '../../services/api';
import './PrintableReportCard.scss';

/**
 * The report card on the school's own design: its First, Second and Third
 * Term sheets, one A4 page each.
 *
 * Everything printed comes from the report-card endpoint (`card`), which works
 * out every figure on the school's own scale for the class's level: grades,
 * the key to ratings, the head's comment and its label, the arm's averages and
 * positions, attendance, next term's date and the promotion stamp. Nothing is
 * re-derived here, so the card cannot disagree with the portal's results.
 *
 * Second and Third Term add four cumulative columns per subject: obtainable
 * (100 per term the subject was taken), obtained (those terms' totals), the
 * cumulative score (obtained ÷ terms) and its grade.
 */

const TRAITS = [
  ['punctuality', 'Punctuality'],
  ['attentiveness', 'Attentiveness'],
  ['timeManagement', 'Time Management'],
  ['creativity', 'Creativity'],
  ['teamWork', 'Team Work'],
  ['neatness', 'Neatness'],
  ['sport', 'Sport'],
];
const RATINGS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
const SCORE_PARTS = ['ca1', 'ca2', 'classWork', 'project', 'exam'];

const TITLES = {
  'First Term': 'FIRST TERM RESULT',
  'Second Term': 'SECOND TERM RESULT',
  'Third Term': 'THIRD TERM RESULT',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const ordinal = (n) => {
  if (!n && n !== 0) return '';
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};

// "2024/2025" → "2024-2025", as the school's cards write a session.
const session = (year) => String(year || '').replace('/', '-');

// "January 6th, 2025 - Second term (2024-2025)"
const nextTermLine = (next) => {
  if (!next) return '';
  const term = next.term.replace('Term', 'term');
  const when = `${term} (${session(next.academicYear)})`;
  if (!next.startDate) return when;
  const d = new Date(next.startDate);
  return `${MONTHS[d.getUTCMonth()]} ${ordinal(d.getUTCDate())}, ${d.getUTCFullYear()} - ${when}`;
};

const fixed2 = (n) =>
  n === null || n === undefined || n === '' ? '' : Number(n).toFixed(2);

export default function PrintableReportCard({ card, term, academicYear }) {
  const ref = useRef(null);
  const school = useFeatureStore((s) => s.school) || {};

  const student = card?.student || {};
  const summary = card?.summary || {};
  const results = card?.results || [];
  const cumulative = card?.cumulative;
  const scale = card?.gradeScale || [];

  const handlePrint = useReactToPrint({
    contentRef: ref,
    documentTitle: `${student.firstName || ''}_${student.lastName || ''}_${term}_${academicYear}`,
    pageStyle: '@page { size: A4 portrait; margin: 8mm; }',
  });

  // The school's college cards print every score to two places (8.00, 7.30);
  // its primary cards print whole numbers. Follow the scores: any fraction on
  // the card and every score is shown to two places.
  const hasFraction = results.some((r) =>
    SCORE_PARTS.some((k) => !Number.isInteger(Number(r.scores?.[k] || 0))),
  );
  const show = (n) =>
    n === undefined || n === null
      ? ''
      : hasFraction
        ? Number(n).toFixed(2)
        : String(Math.round(Number(n) * 100) / 100);

  const cumBySubject = new Map(
    (cumulative?.subjects || []).map((c) => [
      String(c.subject?._id || c.subject),
      c,
    ]),
  );
  const withCumulative = Boolean(cumulative) && term !== 'First Term';

  const className = [
    student.studentProfile?.class?.name,
    summary.section || student.studentProfile?.section,
  ]
    .filter(Boolean)
    .join(' ');

  // The logo is served by the API (a path under it, versioned by upload); the
  // head's signature comes inside the card itself and has no URL.
  const logoUrl = school.logoPath
    ? `${api.defaults.baseURL}${school.logoPath}`
    : null;
  const logo = logoUrl ? (
    <img className="rc-logo" src={logoUrl} alt="" />
  ) : (
    <div className="rc-logo rc-logo--empty" />
  );

  return (
    <div>
      <button
        type="button"
        className="btn btn--primary print-btn"
        onClick={handlePrint}
      >
        <Printer size={16} /> Print Report Card
      </button>

      <div className="rc-scroll">
        <div ref={ref} className="rc">
          {/* ── School header ─────────────────────────────────────────── */}
          <header className="rc-head">
            {logo}
            <div className="rc-school">
              <h1>{school.name || ''}</h1>
              {school.address && <p>{school.address}</p>}
              {school.email && <p>E-Mail: {school.email}</p>}
              {school.phones && <p>{school.phones}</p>}
            </div>
            {logo}
          </header>
          <div className="rc-title">
            <span>{TITLES[term] || `${term} RESULT`.toUpperCase()}</span>
          </div>

          {/* ── Student details ───────────────────────────────────────── */}
          <div className="rc-info">
            <Field label="NAME" wide>
              {`${student.lastName || ''} ${student.firstName || ''}`
                .trim()
                .toUpperCase()}
            </Field>
            <Field label="SESSION">{session(academicYear)}</Field>
            <Field label="TERM">{term}</Field>

            <Field label="CLASS" wide>
              {className}
            </Field>
            <Field label="GENDER">{student.studentProfile?.gender}</Field>
            <Field label="LEARNERS IN CLASS">
              {summary.totalStudentsInClass}
            </Field>

            <Field label="OBTAINABLE SCORE">{summary.obtainableScore}</Field>
            <Field label="OBTAINED SCORE">
              {fixed2(summary.obtainedScore)}
            </Field>
            <Field label="GRADE" wide>
              {summary.gradeLabel}
            </Field>

            <Field label="HIGHEST AVERAGE">
              {fixed2(summary.highestAverage)}
            </Field>
            <Field label="LOWEST AVERAGE">
              {fixed2(summary.lowestAverage)}
            </Field>
            <Field label="CLASS AVERAGE">{fixed2(summary.classAverage)}</Field>
            <Field label="STUDENT'S AVERAGE">{fixed2(summary.average)}</Field>

            <Field label="DAYS PRESENT">{card?.attendance?.daysPresent}</Field>
            <Field label="DAYS ABSENT">{card?.attendance?.daysAbsent}</Field>
            <Field label="POSITION">
              {summary.overallPosition
                ? `${ordinal(summary.overallPosition)} of ${summary.totalStudentsInClass}`
                : ''}
            </Field>
            <Field label="RESULT TYPE">Exam</Field>
          </div>

          {/* ── Scores ────────────────────────────────────────────────── */}
          <table className="rc-table">
            <thead>
              <tr>
                <th className="rc-subject">SUBJECTS/SCHEME</th>
                <th>
                  1st CA
                  <small>10 %</small>
                </th>
                <th>
                  2nd CA
                  <small>10 %</small>
                </th>
                <th>
                  Classwork
                  <small>10 %</small>
                </th>
                <th>
                  Project
                  <small>10 %</small>
                </th>
                <th>
                  Exam
                  <small>60 %</small>
                </th>
                <th>
                  TOTAL
                  <small>100 %</small>
                </th>
                <th>GRADE</th>
                <th>COMMENT</th>
                <th>POS.</th>
                {withCumulative && (
                  <>
                    <th>OBTAINABLE SCORE</th>
                    <th>OBTAINED SCORE</th>
                    <th>CUMM. SCORE</th>
                    <th>CUMM. GRADE</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const cum = cumBySubject.get(String(r.subject?._id));
                return (
                  <tr key={r._id}>
                    <td className="rc-subject">
                      {String(r.subject?.name || '').toUpperCase()}
                    </td>
                    {SCORE_PARTS.map((k) => (
                      <td key={k}>{show(r.scores?.[k] ?? 0)}</td>
                    ))}
                    <td>{show(r.totalScore)}</td>
                    <td>{r.grade}</td>
                    <td>{r.remark}</td>
                    <td>{ordinal(r.position)}</td>
                    {withCumulative && (
                      <>
                        <td>{fixed2(cum?.obtainableScore)}</td>
                        <td>{fixed2(cum?.obtainedScore)}</td>
                        <td>{fixed2(cum?.cumulativeScore)}</td>
                        <td>{cum?.grade}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Key to ratings and behaviour ──────────────────────────── */}
          <div className="rc-lower">
            <table className="rc-key">
              <thead>
                <tr>
                  <th colSpan={2}>KEY TO RATINGS</th>
                </tr>
              </thead>
              <tbody>
                {scale.map((b) => (
                  <tr key={b.grade}>
                    <td>
                      {b.grade} - {b.remark}
                    </td>
                    <td>
                      {fixed2(b.min)} - {fixed2(b.max)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="rc-behaviour">
              <thead>
                <tr>
                  <th>Behaviour</th>
                  {RATINGS.map((r) => (
                    <th key={r}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TRAITS.map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    {RATINGS.map((r) => (
                      <td key={r} className="rc-tick">
                        {card?.behaviour?.[key] === r ? '✓' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Comments ──────────────────────────────────────────────── */}
          <div className="rc-comments">
            {/* Anchored to the comments, not the page: the table's length
                varies with the subjects, and a fixed spot covered its rows. */}
            {card?.promotion && (
              <div className="rc-stamp" aria-label={card.promotion}>
                {card.promotion.toUpperCase()}
              </div>
            )}
            <Line label="TEACHER'S COMMENT:">{card?.teacherComment}</Line>
            <Line
              label={`${summary.headCommentLabel || "HEAD TEACHER'S COMMENT/SIGN"}:`}
            >
              <span className="rc-head-comment">
                {summary.principalComment}
              </span>
              {card?.signature && (
                <img className="rc-signature" src={card.signature} alt="" />
              )}
            </Line>
            <Line label="NEXT TERM BEGINS ON:">
              {nextTermLine(card?.nextTerm)}
            </Line>
          </div>

          <footer className="rc-foot">© {school.name || ''}</footer>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, wide = false }) {
  return (
    <div className={`rc-field${wide ? ' rc-field--wide' : ''}`}>
      <span className="rc-field__label">{label}</span>
      <span className="rc-field__value">{children}</span>
    </div>
  );
}

function Line({ label, children }) {
  return (
    <div className="rc-line">
      <span className="rc-line__label">{label}</span>
      <span className="rc-line__value">{children}</span>
    </div>
  );
}
