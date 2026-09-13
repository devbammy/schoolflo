import React, { useEffect, useState } from 'react';
import { Download, FileText, TrendingUp } from 'lucide-react';
import { resultService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import {
  getCurrentAcademicYear,
  generateAcademicYearOptions,
} from '../../utils/academicYear';

const GRADE_COLORS = {
  A: '#10B981',
  B: '#3B82F6',
  C: '#F59E0B',
  D: '#F97316',
  E: '#EF4444',
  F: '#991B1B',
};
const TERMS = ['First Term', 'Second Term', 'Third Term'];

export default function StudentResults() {
  const { user } = useAuthStore();
  const [reportCard, setReportCard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    term: 'First Term',
    academicYear: getCurrentAcademicYear(),
  });

  useEffect(() => {
    if (!user?._id) return;
    setLoading(true);
    resultService
      .getReportCard(user._id, filters)
      .then((r) => setReportCard(r.data.data))
      .catch((err) => {
        if (err.response?.status !== 404) toast.error('Failed to load results');
        setReportCard(null);
      })
      .finally(() => setLoading(false));
  }, [user?._id, filters.term, filters.academicYear]);

  const summary = reportCard?.summary;
  const results = reportCard?.results || [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">My Results</h1>
          <p className="page-header__subtitle">Academic performance report</p>
        </div>
      </div>

      {/* Term Selector */}
      <div
        style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}
      >
        {TERMS.map((t) => (
          <button
            key={t}
            className={`btn ${filters.term === t ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setFilters((f) => ({ ...f, term: t }))}
          >
            {t}
          </button>
        ))}
        <select
          className="form-control"
          style={{ width: 140 }}
          value={filters.academicYear}
          onChange={(e) =>
            setFilters((f) => ({ ...f, academicYear: e.target.value }))
          }
        >
          {generateAcademicYearOptions(5).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" />
        </div>
      ) : !reportCard ? (
        <div className="card">
          <div className="empty-state">
            <FileText size={48} className="empty-state__icon" />
            <p className="empty-state__title">No Published Results</p>
            <p className="empty-state__text">
              Results for {filters.term} {filters.academicYear} have not been
              published yet.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary Card */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            {[
              {
                label: 'Average Score',
                value: `${summary.average}%`,
                color: GRADE_COLORS[summary.grade],
              },
              {
                label: 'Overall Grade',
                value: summary.grade,
                color: GRADE_COLORS[summary.grade],
              },
              {
                label: 'Class Position',
                value: `${summary.overallPosition} / ${summary.totalStudentsInClass}`,
                color: '#1A4FAB',
              },
              {
                label: 'Subjects',
                value: summary.totalSubjects,
                color: '#0891B2',
              },
              {
                label: 'GPA',
                value: summary.gpa?.toFixed(2),
                color: '#7C3AED',
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: 'var(--clr-surface)',
                  border: '1px solid var(--clr-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px 16px',
                  textAlign: 'center',
                  borderTop: `3px solid ${item.color}`,
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--clr-text-3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 8,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: item.color,
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Principal's Comment */}
          <div
            className="card"
            style={{
              marginBottom: 24,
              borderLeft: '4px solid var(--clr-primary)',
            }}
          >
            <div className="card__body">
              <div
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--clr-text-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 8,
                }}
              >
                Principal's Remark
              </div>
              <p
                style={{
                  fontStyle: 'italic',
                  color: 'var(--clr-text-1)',
                  fontSize: '1rem',
                }}
              >
                "{summary.principalComment}"
              </p>
            </div>
          </div>

          {/* Results Table */}
          <div className="card">
            <div className="card__header">
              <span className="card__title">Subject Scores</span>
              <span
                style={{ fontSize: '0.875rem', color: 'var(--clr-text-3)' }}
              >
                {filters.term} • {filters.academicYear}
              </span>
            </div>
            <div
              className="table-wrapper"
              style={{ border: 'none', borderRadius: 0 }}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Subject</th>
                    <th style={{ textAlign: 'center' }}>1st CA</th>
                    <th style={{ textAlign: 'center' }}>2nd CA</th>
                    <th style={{ textAlign: 'center' }}>Class Work</th>
                    <th style={{ textAlign: 'center' }}>Project</th>
                    <th style={{ textAlign: 'center' }}>Exam</th>
                    <th style={{ textAlign: 'center' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Grade</th>
                    <th>Remark</th>
                    <th style={{ textAlign: 'center' }}>Position</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => (
                    <tr key={r._id}>
                      <td style={{ color: 'var(--clr-text-3)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{r.subject?.name}</td>
                      <td style={{ textAlign: 'center' }}>
                        {r.scores?.ca1 || 0}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {r.scores?.ca2 || 0}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {r.scores?.classWork || 0}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {r.scores?.project || 0}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {r.scores?.exam || 0}
                      </td>
                      <td
                        style={{
                          textAlign: 'center',
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          fontSize: '1rem',
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
                          color: GRADE_COLORS[r.grade],
                          fontWeight: 500,
                          fontSize: '0.875rem',
                        }}
                      >
                        {r.remark}
                      </td>
                      <td
                        style={{
                          textAlign: 'center',
                          fontWeight: 600,
                          color:
                            r.position <= 3
                              ? 'var(--clr-accent)'
                              : 'var(--clr-text-2)',
                        }}
                      >
                        {r.position
                          ? `${r.position}${r.position === 1 ? 'st' : r.position === 2 ? 'nd' : r.position === 3 ? 'rd' : 'th'}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--clr-bg)', fontWeight: 700 }}>
                    <td
                      colSpan={7}
                      style={{
                        padding: '14px 16px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: 'var(--clr-text-1)',
                      }}
                    >
                      Average Total
                    </td>
                    <td
                      style={{
                        textAlign: 'center',
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.125rem',
                        color: GRADE_COLORS[summary.grade],
                      }}
                    >
                      {summary.average}%
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`grade grade-${summary.grade}`}>
                        {summary.grade}
                      </span>
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
