import React, { useEffect, useState } from 'react';
import { Save, CheckCircle, BarChart3 } from 'lucide-react';
import {
  resultService,
  classService,
  subjectService,
  userService,
} from '../../services/api';
import toast from 'react-hot-toast';
import {
  getCurrentAcademicYear,
  generateAcademicYearOptions,
} from '../../utils/academicYear';
import {
  SCORE_COMPONENTS,
  SCORE_CAPS,
  EMPTY_SCORES,
  scoreTotal,
} from '../../utils/scoreComponents';

const TERMS = ['First Term', 'Second Term', 'Third Term'];

export default function GradesPage() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [existingResults, setExistingResults] = useState({});
  const [scores, setScores] = useState({});
  const [filters, setFilters] = useState({
    class: '',
    subject: '',
    term: 'First Term',
    academicYear: getCurrentAcademicYear(),
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    Promise.all([classService.getAll(), subjectService.getAll()]).then(
      ([c, s]) => {
        setClasses(c.data.data.classes || []);
        setSubjects(s.data.data.subjects || []);
      },
    );
  }, []);

  useEffect(() => {
    if (!filters.class || !filters.subject) return;
    setLoading(true);
    Promise.all([
      userService.getByClass(filters.class),
      resultService.getClassResults(filters.class, {
        term: filters.term,
        academicYear: filters.academicYear,
        subject: filters.subject,
      }),
    ])
      .then(([sRes, rRes]) => {
        setStudents(sRes.data.data.students || []);
        const rMap = {};
        const sMap = {};
        (rRes.data.data?.results || []).forEach((r) => {
          if (String(r.subject._id || r.subject) === filters.subject) {
            rMap[r.student._id || r.student] = r;
            sMap[r.student._id || r.student] = { ...r.scores };
          }
        });
        setExistingResults(rMap);
        setScores(sMap);
      })
      .catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false));
  }, [filters.class, filters.subject, filters.term, filters.academicYear]);

  const setScore = (studentId, field, val) => {
    const cap = SCORE_CAPS[field];
    const num = Math.min(cap, Math.max(0, Number(val) || 0));
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [field]: num },
    }));
  };

  const calcTotal = (studentId) => scoreTotal(scores[studentId]);

  const getGrade = (total) => {
    if (total >= 70) return { g: 'A', c: 'A' };
    if (total >= 60) return { g: 'B', c: 'B' };
    if (total >= 50) return { g: 'C', c: 'C' };
    if (total >= 45) return { g: 'D', c: 'D' };
    if (total >= 40) return { g: 'E', c: 'E' };
    return { g: 'F', c: 'F' };
  };

  const handleBulkSave = async () => {
    if (!filters.class || !filters.subject)
      return toast.error('Select class and subject first');
    setSaving(true);
    try {
      const results = students.map((s) => ({
        student: s._id,
        scores: scores[s._id] || { ...EMPTY_SCORES },
      }));
      await resultService.bulkUpsert({
        class: filters.class,
        subject: filters.subject,
        term: filters.term,
        academicYear: filters.academicYear,
        results,
      });
      toast.success(`${students.length} results saved`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!filters.class) return;
    if (
      !window.confirm(
        'Publish all results for this class? Students and parents will be notified.',
      )
    )
      return;
    setPublishing(true);
    try {
      const res = await resultService.publish({
        class: filters.class,
        term: filters.term,
        academicYear: filters.academicYear,
      });
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const hasData = filters.class && filters.subject && students.length > 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Grades & Results</h1>
          <p className="page-header__subtitle">
            Enter and manage student scores
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {hasData && (
            <>
              <button
                className="btn btn--secondary"
                onClick={handlePublish}
                disabled={publishing}
              >
                <CheckCircle size={15} />{' '}
                {publishing ? 'Publishing...' : 'Publish Results'}
              </button>
              <button
                className="btn btn--primary"
                onClick={handleBulkSave}
                disabled={saving}
              >
                <Save size={15} /> {saving ? 'Saving...' : 'Save All'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div
          className="card__body"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))',
            gap: 16,
          }}
        >
          {[
            ['class', 'Class', classes, 'name'],
            ['subject', 'Subject', subjects, 'name'],
          ].map(([key, label, opts, nameKey]) => (
            <div className="form-group" key={key} style={{ marginBottom: 0 }}>
              <label>{label}</label>
              <select
                className="form-control"
                value={filters[key]}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, [key]: e.target.value }))
                }
              >
                <option value="">Select {label}</option>
                {opts.map((o) => (
                  <option key={o._id} value={o._id}>
                    {o[nameKey]}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Term</label>
            <select
              className="form-control"
              value={filters.term}
              onChange={(e) =>
                setFilters((f) => ({ ...f, term: e.target.value }))
              }
            >
              {TERMS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Academic Year</label>
            <input
              className="form-control"
              value={filters.academicYear}
              onChange={(e) =>
                setFilters((f) => ({ ...f, academicYear: e.target.value }))
              }
            />
          </div>
        </div>
      </div>

      {/* Score Entry Table */}
      <div className="card">
        {loading ? (
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: 60 }}
          >
            <div className="spinner" />
          </div>
        ) : !filters.class || !filters.subject ? (
          <div className="empty-state">
            <BarChart3 size={40} className="empty-state__icon" />
            <p className="empty-state__title">Select Class & Subject</p>
            <p className="empty-state__text">
              Choose a class and subject above to start entering grades
            </p>
          </div>
        ) : students.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No students in this class</p>
          </div>
        ) : (
          <>
            {/* Score cap legend */}
            <div
              style={{
                padding: '12px 20px',
                background: 'var(--clr-bg)',
                borderBottom: '1px solid var(--clr-border)',
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap',
              }}
            >
              {SCORE_COMPONENTS.map(({ key, label, max }) => (
                <span
                  key={key}
                  style={{ fontSize: '0.8125rem', color: 'var(--clr-text-3)' }}
                >
                  <strong style={{ color: 'var(--clr-text-2)' }}>
                    {label}
                  </strong>
                  : max {max}
                </span>
              ))}
            </div>

            <div
              className="table-wrapper"
              style={{ border: 'none', borderRadius: 0 }}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student</th>
                    {SCORE_COMPONENTS.map(({ key, label, max }) => (
                      <th key={key} style={{ textAlign: 'center' }}>
                        {label} /{max}
                      </th>
                    ))}
                    <th style={{ textAlign: 'center' }}>Total /100</th>
                    <th style={{ textAlign: 'center' }}>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, idx) => {
                    const total = calcTotal(s._id);
                    const { g, c } = getGrade(total);
                    return (
                      <tr key={s._id}>
                        <td
                          style={{
                            color: 'var(--clr-text-3)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {idx + 1}
                        </td>
                        <td>
                          <div
                            style={{ fontWeight: 600, fontSize: '0.9375rem' }}
                          >
                            {s.firstName} {s.lastName}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            {s.studentProfile?.admissionNumber}
                          </div>
                        </td>
                        {SCORE_COMPONENTS.map(({ key: field }) => (
                          <td
                            key={field}
                            style={{ textAlign: 'center', padding: '8px 4px' }}
                          >
                            <input
                              type="number"
                              min={0}
                              max={SCORE_CAPS[field]}
                              className="form-control"
                              style={{
                                width: 64,
                                textAlign: 'center',
                                padding: '6px 8px',
                                margin: '0 auto',
                              }}
                              value={scores[s._id]?.[field] ?? ''}
                              onChange={(e) =>
                                setScore(s._id, field, e.target.value)
                              }
                            />
                          </td>
                        ))}
                        <td
                          style={{
                            textAlign: 'center',
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            fontSize: '1.0625rem',
                          }}
                        >
                          {total}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`grade grade-${c}`}>{g}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
