import React, { useMemo, useRef } from 'react';
import { Printer } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import './PrintableTimetable.scss';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * A timetable that survives being put on paper.
 *
 * The on-screen view is built for a phone — one day at a time, with a day
 * switcher. That is the wrong shape for print: what gets pinned to a
 * noticeboard or stuck inside an exercise book is the whole week at once, so
 * this renders its own grid rather than trying to print the interactive one.
 *
 * Columns are period numbers rather than clock times. Schools shift the
 * timing of a period between days — a Friday assembly pushes everything back
 * fifteen minutes — and keying the grid on times produces a column per
 * variant, which is neither readable nor true.
 */

const cellTone = (period) => {
  if (!period) return 'ptt__cell--free';
  if (period.isBreak) return 'ptt__cell--break';
  return '';
};

export default function PrintableTimetable({
  timetable,
  title = 'Timetable',
  subtitle = '',
  highlightTeacherId = null,
  buttonLabel = 'Print',
  buttonClassName = 'btn btn--secondary btn--sm',
}) {
  const ref = useRef(null);

  const handlePrint = useReactToPrint({
    contentRef: ref,
    documentTitle: [title, subtitle].filter(Boolean).join(' — ') || 'Timetable',
  });

  const { columns, byDay, days } = useMemo(() => {
    const periods = timetable?.periods || [];

    // Only the days that actually carry lessons. A school that does not run
    // Saturdays should not print an empty Saturday row.
    const activeDays = DAYS.filter((day) => periods.some((p) => p.day === day));

    const numbers = [...new Set(periods.map((p) => p.periodNumber))].sort(
      (a, b) => a - b,
    );

    // The time shown in a column header is the one most of the week agrees on,
    // so an odd Friday start does not relabel the whole column.
    const cols = numbers.map((number) => {
      const tally = new Map();
      periods
        .filter((p) => p.periodNumber === number && p.startTime)
        .forEach((p) => {
          const slot = `${p.startTime} - ${p.endTime}`;
          tally.set(slot, (tally.get(slot) || 0) + 1);
        });

      const [commonest] =
        [...tally.entries()].sort((a, b) => b[1] - a[1])[0] || [];

      return { number, time: commonest || '' };
    });

    const map = {};
    activeDays.forEach((day) => {
      map[day] = {};
      periods
        .filter((p) => p.day === day)
        .forEach((p) => {
          map[day][p.periodNumber] = p;
        });
    });

    return { columns: cols, byDay: map, days: activeDays };
  }, [timetable]);

  if (!timetable || columns.length === 0) return null;

  return (
    <>
      <button className={buttonClassName} onClick={handlePrint}>
        <Printer size={15} /> {buttonLabel}
      </button>

      {/* Kept in the DOM but out of view, so the printed sheet is this layout
          and not whatever the screen happens to be showing. */}
      <div className="ptt__offscreen">
        <div className="ptt" ref={ref}>
          <header className="ptt__header">
            <h1 className="ptt__title">{title}</h1>
            {subtitle && <p className="ptt__subtitle">{subtitle}</p>}
          </header>

          <table className="ptt__grid">
            <thead>
              <tr>
                <th className="ptt__dayhead">Day</th>
                {columns.map((col) => (
                  <th key={col.number}>
                    <span className="ptt__pnum">Period {col.number}</span>
                    {col.time && <span className="ptt__ptime">{col.time}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day}>
                  <th className="ptt__dayhead" scope="row">
                    {day}
                  </th>
                  {columns.map((col) => {
                    const period = byDay[day][col.number];
                    const mine =
                      highlightTeacherId &&
                      period?.teacher &&
                      String(period.teacher?._id || period.teacher) ===
                        String(highlightTeacherId);

                    return (
                      <td
                        key={col.number}
                        className={`ptt__cell ${cellTone(period)} ${
                          mine ? 'ptt__cell--mine' : ''
                        }`}
                      >
                        {!period && <span className="ptt__free">—</span>}

                        {period?.isBreak && (
                          <span className="ptt__break">
                            {period.breakLabel || 'Break'}
                          </span>
                        )}

                        {period && !period.isBreak && (
                          <>
                            <span className="ptt__subject">
                              {period.subject?.name || 'Free'}
                            </span>
                            {period.teacher && (
                              <span className="ptt__meta">
                                {period.teacher.firstName}{' '}
                                {period.teacher.lastName}
                              </span>
                            )}
                            {period.room && (
                              <span className="ptt__meta">{period.room}</span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {timetable.notes && (
            <p className="ptt__notes">
              <strong>Notes:</strong> {timetable.notes}
            </p>
          )}

          <footer className="ptt__footer">
            Printed{' '}
            {new Date().toLocaleDateString('en-NG', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </footer>
        </div>
      </div>
    </>
  );
}
