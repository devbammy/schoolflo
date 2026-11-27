import React, { useEffect, useState } from 'react';
import { resultService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { gradeColor } from '../../utils/grading';
import ResultsLocked, {
  lockFromError,
} from '../../components/common/ResultsLocked';
import { getCurrentAcademicYear } from '../../utils/academicYear';
import { CA_MAX, caTotal } from '../../utils/scoreComponents';
export default function ParentResults() {
  const { user } = useAuthStore();
  const children = user?.parentProfile?.children || [];
  const [selected, setSelected] = useState('');
  const [reportCard, setReportCard] = useState(null);
  const [loading, setLoading] = useState(false);
  // Set when the school holds this term's result back over unpaid fees.
  const [lock, setLock] = useState(null);
  const [term, setTerm] = useState('First Term');

  const childId = selected || children[0]?._id || children[0];

  useEffect(() => {
    if (!childId) return;
    setLoading(true);
    setLock(null);
    resultService
      .getReportCard(childId, { term, academicYear: getCurrentAcademicYear() })
      .then((r) => setReportCard(r.data.data))
      .catch((err) => {
        setLock(lockFromError(err));
        setReportCard(null);
      })
      .finally(() => setLoading(false));
  }, [childId, term]);


  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Academic Results</h1>
        </div>
      </div>
      <div
        style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}
      >
        {children.map((c) => {
          const id = c._id || c;
          const name = c.firstName ? `${c.firstName} ${c.lastName}` : 'Child';
          return (
            <button
              key={id}
              className={`btn ${(selected || childId) === id ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setSelected(id)}
            >
              {name}
            </button>
          );
        })}
        {['First Term', 'Second Term', 'Third Term'].map((t) => (
          <button
            key={t}
            className={`btn ${term === t ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setTerm(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : lock ? (
        <ResultsLocked lock={lock} />
      ) : !reportCard ? (
        <div className="card">
          <div className="empty-state">
            <p className="empty-state__title">No results published yet</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card__header">
            <span className="card__title">Report Card — {term}</span>
            <span className="badge badge--info">
              Position: {reportCard.summary?.overallPosition}/
              {reportCard.summary?.totalStudentsInClass}
            </span>
          </div>
          <div
            className="table-wrapper"
            style={{ border: 'none', borderRadius: 0 }}
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th style={{ textAlign: 'center' }}>CA Total /{CA_MAX}</th>
                  <th style={{ textAlign: 'center' }}>Exam</th>
                  <th style={{ textAlign: 'center' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Grade</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {reportCard.results?.map((r) => (
                  <tr key={r._id}>
                    <td style={{ fontWeight: 600 }}>{r.subject?.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      {caTotal(r.scores)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.scores?.exam || 0}
                    </td>
                    <td
                      style={{
                        textAlign: 'center',
                        fontWeight: 700,
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      {r.totalScore}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`grade grade-${r.grade}`}>
                        {r.grade}
                      </span>
                    </td>
                    <td
                      style={{
                        color: gradeColor(r.grade),
                        fontSize: '0.875rem',
                      }}
                    >
                      {r.remark}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className="card__footer"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '0.875rem', color: 'var(--clr-text-3)' }}>
              Average:{' '}
              <strong
                style={{ color: gradeColor(reportCard.summary?.grade) }}
              >
                {reportCard.summary?.average}%
              </strong>
            </span>
            <span
              style={{
                fontStyle: 'italic',
                fontSize: '0.875rem',
                color: 'var(--clr-text-3)',
                maxWidth: 400,
              }}
            >
              {reportCard.summary?.principalComment}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
