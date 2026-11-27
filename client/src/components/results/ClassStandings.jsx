import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { resultService } from '../../services/api';
import { gradeColor } from '../../utils/grading';

/**
 * A class's standings for a term, for the admin: every student's average and
 * position with the highest, lowest and class average, for one arm or for the
 * whole class together.
 *
 * Report cards compare a student with their own arm. This view adds the whole
 * class, as the school asked, so the office can see both. Published results
 * only, the figures the cards print.
 */
export default function ClassStandings({
  classId,
  term,
  academicYear,
  sections = [],
}) {
  const [scope, setScope] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setScope(''), [classId]);

  useEffect(() => {
    if (!classId) return;
    let live = true;
    setLoading(true);
    resultService
      .getClassSummary(classId, {
        term,
        academicYear,
        section: scope || undefined,
      })
      .then((res) => live && setData(res.data.data))
      .catch(() => live && setData(null))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [classId, term, academicYear, scope]);

  const choices = [
    { value: '', label: 'Whole class' },
    ...sections.map((s) => ({ value: s.name, label: `Arm ${s.name}` })),
  ];

  const tile = (label, value) => (
    <div
      style={{
        padding: '10px 14px',
        border: '1px solid var(--clr-border)',
        borderRadius: 'var(--radius-md)',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)' }}>
        {label}
      </div>
      <div
        style={{ fontWeight: 700, fontSize: '1.125rem', whiteSpace: 'nowrap' }}
      >
        {value ?? '—'}
      </div>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card__header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <span
          className="card__title"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Trophy size={16} /> Class standings · {term}
        </span>
        {choices.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {choices.map((c) => (
              <button
                key={c.value || 'all'}
                type="button"
                className={`btn btn--sm ${scope === c.value ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => setScope(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card__body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <span className="spinner" />
          </div>
        ) : !data?.students?.length ? (
          <p style={{ margin: 0, color: 'var(--clr-text-3)' }}>
            No published results for {scope ? `arm ${scope}` : 'this class'} in{' '}
            {term} {academicYear}.
          </p>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(min(140px, 100%), 1fr))',
                gap: 10,
                marginBottom: 16,
              }}
            >
              {tile('Learners', data.learners)}
              {tile('Highest average', data.highestAverage?.toFixed(2))}
              {tile('Lowest average', data.lowestAverage?.toFixed(2))}
              {tile('Class average', data.classAverage?.toFixed(2))}
            </div>
            <div
              className="table-wrapper"
              style={{ maxHeight: 360, overflowY: 'auto' }}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 64 }}>Pos.</th>
                    <th>Student</th>
                    <th>Arm</th>
                    <th style={{ textAlign: 'right' }}>Obtained</th>
                    <th style={{ textAlign: 'right' }}>Average</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => (
                    <tr key={s.studentId}>
                      <td style={{ fontWeight: 600 }}>{s.position}</td>
                      <td>
                        {s.firstName} {s.lastName}
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          {s.admissionNumber}
                        </div>
                      </td>
                      <td>{s.section || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {s.obtainedScore.toFixed(2)} / {s.subjects * 100}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {s.average.toFixed(2)}
                      </td>
                      <td
                        style={{ color: gradeColor(s.grade), fontWeight: 600 }}
                      >
                        {s.grade}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
