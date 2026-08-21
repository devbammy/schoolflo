import React, { useEffect, useState, useCallback } from 'react';
import { BarChart3, CheckCircle, Eye, RefreshCw } from 'lucide-react';
import {
  resultService,
  classService,
  subjectService,
  userService,
} from '../../services/api';
import Modal from '../../components/common/Modal';
import toast from 'react-hot-toast';
import {
  generateAcademicYearOptions,
  getCurrentAcademicYear,
} from '../../utils/academicYear';
import {
  SCORE_COMPONENTS,
  SCORE_CAPS,
  EMPTY_SCORES,
  CA_MAX,
  caTotal,
  scoreTotal,
} from '../../utils/scoreComponents';

const TERMS = ['First Term', 'Second Term', 'Third Term'];

function gradeOf(score) {
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 45) return 'D';
  if (score >= 40) return 'E';
  return 'F';
}

export default function ResultsAdminPage() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [results, setResults] = useState([]);
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
  const [modal, setModal] = useState(null); // 'reportCard'
  const [reportCard, setReportCard] = useState(null);
  const [reportStudent, setReportStudent] = useState(null);

  useEffect(() => {
    Promise.all([classService.getAll(), subjectService.getAll()]).then(
      ([c, s]) => {
        setClasses(c.data.data.classes || []);
        setSubjects(s.data.data.subjects || []);
      },
    );
  }, []);

  const loadData = useCallback(async () => {
    if (!filters.class) return;
    setLoading(true);
    try {
      const [studRes, resRes] = await Promise.all([
        userService.getByClass(filters.class),
        resultService.getClassResults(filters.class, {
          term: filters.term,
          academicYear: filters.academicYear,
          subject: filters.subject || undefined,
        }),
      ]);
      const studs = studRes.data.data.students || [];
      setStudents(studs);

      const resMap = {};
      const scMap = {};
      (resRes.data.data?.results || []).forEach((r) => {
        const sid = r.student?._id || r.student;
        if (!resMap[sid]) resMap[sid] = {};
        const subId = r.subject?._id || r.subject;
        resMap[sid][subId] = r;
        if (!scMap[sid]) scMap[sid] = {};
        scMap[sid][subId] = { ...r.scores };
      });
      setResults(resMap);
      setScores(scMap);
    } catch {
      toast.error('Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const setScore = (studentId, subjectId, field, val) => {
    const cap = SCORE_CAPS[field];
    const num = Math.min(cap, Math.max(0, Number(val) || 0));
    setScores((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [subjectId]: { ...(prev[studentId]?.[subjectId] || {}), [field]: num },
      },
    }));
  };

  const calcTotal = (studentId, subjectId) =>
    scoreTotal(scores[studentId]?.[subjectId]);

  const handleBulkSave = async () => {
    if (!filters.class || !filters.subject)
      return toast.error('Select a class AND subject to save');
    setSaving(true);
    try {
      const payload = students.map((s) => ({
        student: s._id,
        scores: scores[s._id]?.[filters.subject] || { ...EMPTY_SCORES },
      }));
      await resultService.bulkUpsert({
        class: filters.class,
        subject: filters.subject,
        term: filters.term,
        academicYear: filters.academicYear,
        results: payload,
      });
      toast.success(`${students.length} results saved`);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!filters.class) return toast.error('Select a class first');
    if (
      !window.confirm(
        'Publish all results for this class? Students and parents will be notified via email.',
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
      toast.success(res.data.message || 'Results published');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const viewReportCard = async (student) => {
    try {
      const res = await resultService.getReportCard(student._id, {
        term: filters.term,
        academicYear: filters.academicYear,
      });
      setReportCard(res.data.data);
      setReportStudent(student);
      setModal('reportCard');
    } catch {
      toast.error('No published results for this student yet');
    }
  };

  const GRADE_COLORS = {
    A: '#10B981',
    B: '#3B82F6',
    C: '#F59E0B',
    D: '#F97316',
    E: '#EF4444',
    F: '#991B1B',
  };
  const activeSubjects = filters.subject
    ? subjects.filter((s) => s._id === filters.subject)
    : subjects.filter((s) =>
        (s.classes || []).some((c) => (c._id || c) === filters.class),
      );

  const publishedCount = students.filter((s) => {
    const r = results[s._id];
    if (!r) return false;
    return Object.values(r).some((res) => res.isPublished);
  }).length;

  const academicYears = generateAcademicYearOptions({
    count: 5,
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Results Management</h1>
          <p className="page-header__subtitle">
            Enter scores, compute positions, and publish report cards
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {filters.class && (
            <>
              {filters.subject && (
                <button
                  className="btn btn--secondary"
                  onClick={handleBulkSave}
                  disabled={saving}
                >
                  <RefreshCw size={15} /> {saving ? 'Saving...' : 'Save Scores'}
                </button>
              )}
              <button
                className="btn btn--primary"
                onClick={handlePublish}
                disabled={publishing}
              >
                <CheckCircle size={15} />{' '}
                {publishing ? 'Publishing...' : 'Publish Results'}
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 16,
          }}
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Class *</label>
            <select
              className="form-control"
              value={filters.class}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  class: e.target.value,
                  subject: '',
                }))
              }
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Subject (optional)</label>
            <select
              className="form-control"
              value={filters.subject}
              onChange={(e) =>
                setFilters((f) => ({ ...f, subject: e.target.value }))
              }
            >
              <option value="">All Subjects</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
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

            <select
              className="form-control"
              value={filters.academicYear}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  academicYear: e.target.value,
                }))
              }
            >
              {academicYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
        {filters.class && students.length > 0 && (
          <div
            style={{
              padding: '8px 20px',
              borderTop: '1px solid var(--clr-border)',
              display: 'flex',
              gap: 20,
              fontSize: '0.875rem',
              color: 'var(--clr-text-3)',
            }}
          >
            <span>
              <strong style={{ color: 'var(--clr-text-1)' }}>
                {students.length}
              </strong>{' '}
              students
            </span>
            <span>
              <strong style={{ color: 'var(--clr-success)' }}>
                {publishedCount}
              </strong>{' '}
              with published results
            </span>
            <span style={{ color: 'var(--clr-text-3)' }}>
              Caps: CA1/CA2/Mid = 10 each, Exam = 70
            </span>
          </div>
        )}
      </div>

      {/* Score Entry / Results Table */}
      {!filters.class ? (
        <div className="card">
          <div className="empty-state">
            <BarChart3 size={48} className="empty-state__icon" />
            <p className="empty-state__title">Select a class to view results</p>
          </div>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : filters.subject ? (
        /* Single-subject score entry */
        <div className="card">
          <div className="card__header">
            <span className="card__title">
              Score Entry —{' '}
              {subjects.find((s) => s._id === filters.subject)?.name}
            </span>
            <span style={{ fontSize: '0.875rem', color: 'var(--clr-text-3)' }}>
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
                  <th>Student</th>
                  {SCORE_COMPONENTS.map(({ key, label, max }) => (
                    <th key={key} style={{ textAlign: 'center' }}>
                      {label} /{max}
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Grade</th>
                  <th>Published</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => {
                  const total = calcTotal(s._id, filters.subject);
                  const g = gradeOf(total);
                  const isPublished =
                    results[s._id]?.[filters.subject]?.isPublished;
                  return (
                    <tr key={s._id}>
                      <td style={{ color: 'var(--clr-text-3)' }}>{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {s.firstName} {s.lastName}
                        </div>
                        <div
                          style={{
                            fontSize: '0.8rem',
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
                              width: 60,
                              textAlign: 'center',
                              padding: '6px 8px',
                              margin: '0 auto',
                            }}
                            value={
                              scores[s._id]?.[filters.subject]?.[field] ?? ''
                            }
                            onChange={(e) =>
                              setScore(
                                s._id,
                                filters.subject,
                                field,
                                e.target.value,
                              )
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
                        <span className={`grade grade-${g}`}>{g}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isPublished ? (
                          <CheckCircle size={16} color="#10B981" />
                        ) : (
                          <span
                            style={{
                              color: 'var(--clr-text-3)',
                              fontSize: '0.8rem',
                            }}
                          >
                            Draft
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* All-subjects overview per student */
        <div className="card">
          <div className="card__header">
            <span className="card__title">
              Results Overview —{' '}
              {classes.find((c) => c._id === filters.class)?.name}
            </span>
            <span style={{ fontSize: '0.875rem', color: 'var(--clr-text-3)' }}>
              Select a subject above to enter scores
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
                  <th>Student</th>
                  {activeSubjects.slice(0, 6).map((s) => (
                    <th
                      key={s._id}
                      style={{ textAlign: 'center', minWidth: 80 }}
                    >
                      {s.code}
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>Avg</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((st, i) => {
                  const studentResults = results[st._id] || {};
                  const scores = Object.values(studentResults).map(
                    (r) => r.totalScore || 0,
                  );
                  const avg = scores.length
                    ? (
                        scores.reduce((a, b) => a + b, 0) / scores.length
                      ).toFixed(1)
                    : '—';
                  const anyPublished = Object.values(studentResults).some(
                    (r) => r.isPublished,
                  );
                  const allPublished =
                    activeSubjects.length > 0 &&
                    activeSubjects.every(
                      (s) => studentResults[s._id]?.isPublished,
                    );
                  return (
                    <tr key={st._id}>
                      <td style={{ color: 'var(--clr-text-3)' }}>{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {st.firstName} {st.lastName}
                        </div>
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          {st.studentProfile?.admissionNumber}
                        </div>
                      </td>
                      {activeSubjects.slice(0, 6).map((sub) => {
                        const r = studentResults[sub._id];
                        const g = r ? gradeOf(r.totalScore) : null;
                        return (
                          <td key={sub._id} style={{ textAlign: 'center' }}>
                            {r ? (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 2,
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-display)',
                                    fontSize: '0.9rem',
                                  }}
                                >
                                  {r.totalScore}
                                </span>
                                <span
                                  className={`grade grade-${g}`}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    fontSize: '0.7rem',
                                  }}
                                >
                                  {g}
                                </span>
                              </div>
                            ) : (
                              <span
                                style={{
                                  color: 'var(--clr-text-3)',
                                  fontSize: '0.8rem',
                                }}
                              >
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td
                        style={{
                          textAlign: 'center',
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          color:
                            avg !== '—'
                              ? GRADE_COLORS[gradeOf(parseFloat(avg))]
                              : 'var(--clr-text-3)',
                        }}
                      >
                        {avg}
                      </td>
                      <td>
                        <span
                          className={`badge badge--${allPublished ? 'success' : anyPublished ? 'warning' : 'neutral'}`}
                        >
                          {allPublished
                            ? 'Published'
                            : anyPublished
                              ? 'Partial'
                              : 'Draft'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn--ghost btn--sm btn--icon"
                          onClick={() => viewReportCard(st)}
                          title="View Report Card"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report Card Modal */}
      <Modal
        open={modal === 'reportCard'}
        onClose={() => setModal(null)}
        title={`Report Card — ${reportStudent?.firstName} ${reportStudent?.lastName}`}
        maxWidth={700}
        footer={
          <button className="btn btn--secondary" onClick={() => setModal(null)}>
            Close
          </button>
        }
      >
        {reportCard && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 20,
              }}
            >
              {[
                {
                  l: 'Average',
                  v: `${reportCard.summary?.average}%`,
                  c: GRADE_COLORS[reportCard.summary?.grade],
                },
                {
                  l: 'Grade',
                  v: reportCard.summary?.grade,
                  c: GRADE_COLORS[reportCard.summary?.grade],
                },
                {
                  l: 'Position',
                  v: `${reportCard.summary?.overallPosition}/${reportCard.summary?.totalStudentsInClass}`,
                  c: '#1A4FAB',
                },
                {
                  l: 'GPA',
                  v: reportCard.summary?.gpa?.toFixed(2),
                  c: '#7C3AED',
                },
              ].map((item) => (
                <div
                  key={item.l}
                  style={{
                    textAlign: 'center',
                    padding: 12,
                    background: 'var(--clr-bg)',
                    borderRadius: 'var(--radius-md)',
                    borderTop: `3px solid ${item.c}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--clr-text-3)',
                      marginBottom: 4,
                    }}
                  >
                    {item.l}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: '1.25rem',
                      color: item.c,
                    }}
                  >
                    {item.v}
                  </div>
                </div>
              ))}
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th style={{ textAlign: 'center' }}>CA /{CA_MAX}</th>
                    <th style={{ textAlign: 'center' }}>Exam</th>
                    <th style={{ textAlign: 'center' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Grade</th>
                    <th style={{ textAlign: 'center' }}>Pos</th>
                  </tr>
                </thead>
                <tbody>
                  {(reportCard.results || []).map((r) => (
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
                          textAlign: 'center',
                          fontWeight: 600,
                          color:
                            r.position <= 3
                              ? 'var(--clr-accent)'
                              : 'var(--clr-text-2)',
                        }}
                      >
                        {r.position || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              style={{
                marginTop: 16,
                padding: 14,
                background: 'var(--clr-bg)',
                borderRadius: 'var(--radius-md)',
                borderLeft: '4px solid var(--clr-primary)',
                fontStyle: 'italic',
                color: 'var(--clr-text-2)',
                fontSize: '0.9rem',
              }}
            >
              "{reportCard.summary?.principalComment}"
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
