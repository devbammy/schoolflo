import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Eye,
  CheckSquare,
  Clock,
  FileText,
  Upload,
  Users,
} from 'lucide-react';
import {
  assignmentService,
  submissionService,
  classService,
  subjectService,
} from '../../services/api';
import useAuthStore from '../../store/authStore';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import { format, isPast } from 'date-fns';

const TERMS = ['First Term', 'Second Term', 'Third Term'];
const EMPTY_FORM = {
  title: '',
  description: '',
  class: '',
  subject: '',
  term: 'First Term',
  academicYear: '2024/2025',
  dueDate: '',
  totalMarks: 100,
  allowLateSubmission: false,
};

export default function AssignmentsPage() {
  const { user } = useAuthStore();
  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'create' | 'submissions' | 'grade'
  const [selected, setSelected] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [gradeTarget, setGradeTarget] = useState(null);
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' });
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterTerm, setFilterTerm] = useState('');
  const [filterClass, setFilterClass] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterTerm) params.term = filterTerm;
      if (filterClass) params.classId = filterClass;
      const res = await assignmentService.getAll(params);
      setAssignments(res.data.data.assignments || []);
    } catch {
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [filterTerm, filterClass]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    Promise.all([classService.getAll(), subjectService.getAll()]).then(
      ([c, s]) => {
        setClasses(c.data.data.classes || []);
        // Preselect teacher's class
        const myClass = user?.teacherProfile?.classTeacherOf;
        if (myClass) setForm((f) => ({ ...f, class: myClass._id || myClass }));
        // Filter subjects teacher handles
        const mySubjects = (user?.teacherProfile?.subjectsTaught || []).map(
          (s) => s._id || s,
        );
        setSubjects(
          mySubjects.length > 0
            ? (s.data.data.subjects || []).filter((sub) =>
                mySubjects.includes(sub._id),
              )
            : s.data.data.subjects || [],
        );
      },
    );
  }, []);

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      class:
        user?.teacherProfile?.classTeacherOf?._id ||
        user?.teacherProfile?.classTeacherOf ||
        '',
    });
    setFiles([]);
    setSelected(null);
    setModal('create');
  };

  const openSubmissions = async (assignment) => {
    setSelected(assignment);
    setModal('submissions');
    setSubmissionsLoading(true);
    try {
      const res = await submissionService.getForAssignment(assignment._id);
      setSubmissions(res.data.data?.submissions || []);
    } catch {
      toast.error('Failed to load submissions');
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const openGrade = (submission) => {
    setGradeTarget(submission);
    setGradeForm({
      score: submission.score || '',
      feedback: submission.feedback || '',
    });
    setModal('grade');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.class || !form.subject)
      return toast.error('Class and subject are required');
    if (!form.dueDate) return toast.error('Due date is required');
    setSaving(true);
    try {
      const data = { ...form, attachments: files };
      await assignmentService.create(data);
      toast.success('Assignment created and students notified');
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const handleGrade = async (e) => {
    e.preventDefault();
    if (!gradeForm.score && gradeForm.score !== 0)
      return toast.error('Score is required');
    setSaving(true);
    try {
      await submissionService.grade(gradeTarget._id, {
        score: parseFloat(gradeForm.score),
        feedback: gradeForm.feedback,
      });
      toast.success('Submission graded');
      setModal('submissions');
      // Refresh submissions
      const res = await submissionService.getForAssignment(selected._id);
      setSubmissions(res.data.data?.submissions || []);
    } catch (err) {
      toast.error('Grading failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await assignmentService.delete(deleteTarget);
      toast.success('Assignment removed');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Failed');
    }
  };

  const getPendingCount = (ass) => {
    // We don't know without loading submissions, but show overdue indicator
    return isPast(new Date(ass.dueDate));
  };

  const STATUS_CONFIG = {
    Submitted: { color: '#3B82F6', bg: '#dbeafe' },
    Graded: { color: '#10B981', bg: '#d1fae5' },
    Late: { color: '#F59E0B', bg: '#fef3c7' },
    Pending: { color: '#6B7280', bg: '#f3f4f6' },
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Assignments</h1>
          <p className="page-header__subtitle">
            {assignments.length} assignments
          </p>
        </div>
        <button className="btn btn--primary" onClick={openCreate}>
          <Plus size={16} /> Create Assignment
        </button>
      </div>

      {/* Filters */}
      <div
        style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}
      >
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: 160 }}
          value={filterTerm}
          onChange={(e) => setFilterTerm(e.target.value)}
        >
          <option value="">All Terms</option>
          {TERMS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: 160 }}
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Assignment List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <FileText size={48} className="empty-state__icon" />
            <p className="empty-state__title">No assignments yet</p>
            <p className="empty-state__text">
              Create your first assignment for your class
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {assignments.map((a) => {
            const overdue = isPast(new Date(a.dueDate));
            return (
              <div
                key={a._id}
                className="card"
                style={{
                  borderLeft: `4px solid ${overdue ? 'var(--clr-danger)' : 'var(--clr-primary)'}`,
                }}
              >
                <div
                  className="card__body"
                  style={{
                    display: 'flex',
                    gap: 20,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        marginBottom: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <h4
                        style={{ margin: 0, fontFamily: 'var(--font-display)' }}
                      >
                        {a.title}
                      </h4>
                      <span className="badge badge--info">
                        {a.subject?.name}
                      </span>
                      <span className="badge badge--neutral">
                        {a.class?.name}
                      </span>
                      <span
                        className={`badge badge--${overdue ? 'danger' : 'success'}`}
                      >
                        {overdue ? 'Closed' : 'Active'}
                      </span>
                    </div>
                    <p
                      style={{
                        color: 'var(--clr-text-3)',
                        fontSize: '0.9rem',
                        marginBottom: 10,
                        lineHeight: 1.5,
                      }}
                    >
                      {a.description?.slice(0, 180)}
                      {a.description?.length > 180 ? '...' : ''}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        gap: 20,
                        fontSize: '0.8125rem',
                        color: 'var(--clr-text-3)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Clock size={12} />
                        <span
                          style={{
                            color: overdue ? 'var(--clr-danger)' : 'inherit',
                            fontWeight: overdue ? 600 : 400,
                          }}
                        >
                          Due:{' '}
                          {format(new Date(a.dueDate), 'dd MMM yyyy, h:mm a')}
                        </span>
                      </span>
                      <span>
                        Max marks: <strong>{a.totalMarks}</strong>
                      </span>
                      <span>
                        {a.term} • {a.academicYear}
                      </span>
                      {a.attachments?.length > 0 && (
                        <span>
                          <Upload
                            size={12}
                            style={{ verticalAlign: 'middle' }}
                          />{' '}
                          {a.attachments.length} attachment(s)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      flexShrink: 0,
                      alignItems: 'flex-end',
                    }}
                  >
                    <button
                      className="btn btn--primary btn--sm"
                      onClick={() => openSubmissions(a)}
                    >
                      <Users size={14} /> View Submissions
                    </button>
                    <button
                      className="btn btn--secondary btn--sm"
                      style={{
                        color: 'var(--clr-danger)',
                        borderColor: '#fca5a5',
                      }}
                      onClick={() => setDeleteTarget(a._id)}
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Assignment Modal ── */}
      <Modal
        open={modal === 'create'}
        onClose={() => setModal(null)}
        title="Create New Assignment"
        maxWidth={640}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              disabled={saving}
              onClick={handleCreate}
            >
              {saving ? 'Creating...' : 'Create Assignment'}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreate}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Title *</label>
              <input
                className="form-control"
                required
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g. Chapter 5 — Functions Exercise"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Description / Instructions *</label>
              <textarea
                className="form-control"
                rows={3}
                required
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Describe the assignment clearly..."
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 14,
              }}
            >
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Class *</label>
                <select
                  className="form-control"
                  required
                  value={form.class}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, class: e.target.value }))
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
                <label>Subject *</label>
                <select
                  className="form-control"
                  required
                  value={form.subject}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, subject: e.target.value }))
                  }
                >
                  <option value="">Select subject</option>
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
                  value={form.term}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, term: e.target.value }))
                  }
                >
                  {TERMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Due Date & Time *</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  required
                  value={form.dueDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dueDate: e.target.value }))
                  }
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Total Marks *</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="form-control"
                  required
                  value={form.totalMarks}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      totalMarks: parseInt(e.target.value),
                    }))
                  }
                />
              </div>
              <div
                className="form-group"
                style={{
                  marginBottom: 0,
                  display: 'flex',
                  alignItems: 'flex-end',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontWeight: 400,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.allowLateSubmission}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        allowLateSubmission: e.target.checked,
                      }))
                    }
                  />
                  Allow late submissions
                </label>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Attach Files (optional)</label>
              <input
                type="file"
                multiple
                className="form-control"
                onChange={(e) => setFiles(Array.from(e.target.files))}
                accept=".pdf,.doc,.docx,.jpg,.png,.zip"
              />
              {files.length > 0 && (
                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--clr-text-3)',
                    marginTop: 4,
                  }}
                >
                  {files.length} file(s) selected
                </div>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Submissions Modal ── */}
      <Modal
        open={modal === 'submissions'}
        onClose={() => setModal(null)}
        title={`Submissions — ${selected?.title}`}
        maxWidth={720}
        footer={
          <button className="btn btn--secondary" onClick={() => setModal(null)}>
            Close
          </button>
        }
      >
        {submissionsLoading ? (
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: 40 }}
          >
            <div className="spinner" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <Users size={36} className="empty-state__icon" />
            <p className="empty-state__title">No submissions yet</p>
          </div>
        ) : (
          <div>
            <div
              style={{
                display: 'flex',
                gap: 12,
                marginBottom: 16,
                flexWrap: 'wrap',
              }}
            >
              {['Submitted', 'Graded', 'Late'].map((s) => {
                const count = submissions.filter(
                  (sub) => sub.status === s,
                ).length;
                const cfg = STATUS_CONFIG[s];
                return (
                  <div
                    key={s}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      background: cfg.bg,
                      color: cfg.color,
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                    }}
                  >
                    {s}: {count}
                  </div>
                );
              })}
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Files</th>
                    <th>Score</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub) => (
                    <tr key={sub._id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {sub.student?.firstName} {sub.student?.lastName}
                        </div>
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          {sub.student?.studentProfile?.admissionNumber}
                        </div>
                      </td>
                      <td
                        style={{
                          fontSize: '0.875rem',
                          color: sub.isLate
                            ? 'var(--clr-warning)'
                            : 'var(--clr-text-2)',
                        }}
                      >
                        {format(new Date(sub.submittedAt), 'dd MMM, h:mm a')}
                        {sub.isLate && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--clr-warning)',
                            }}
                          >
                            Late
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: 'var(--radius-full)',
                            background:
                              STATUS_CONFIG[sub.status]?.bg || '#f3f4f6',
                            color:
                              STATUS_CONFIG[sub.status]?.color || '#6B7280',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td>
                        {(sub.files || []).map((f, i) => (
                          <a
                            key={i}
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'block',
                              fontSize: '0.8rem',
                              color: 'var(--clr-primary)',
                              textDecoration: 'underline',
                            }}
                          >
                            {f.name}
                          </a>
                        ))}
                        {sub.comment && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--clr-text-3)',
                              marginTop: 2,
                              fontStyle: 'italic',
                            }}
                          >
                            "{sub.comment}"
                          </div>
                        )}
                      </td>
                      <td>
                        {sub.status === 'Graded' ? (
                          <span
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontWeight: 700,
                              color: 'var(--clr-success)',
                            }}
                          >
                            {sub.score}/{selected?.totalMarks}
                          </span>
                        ) : (
                          <span
                            style={{
                              color: 'var(--clr-text-3)',
                              fontSize: '0.875rem',
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => openGrade(sub)}
                        >
                          <CheckSquare size={13} />{' '}
                          {sub.status === 'Graded' ? 'Re-grade' : 'Grade'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Grade Submission Modal ── */}
      <Modal
        open={modal === 'grade'}
        onClose={() => setModal('submissions')}
        title={`Grade — ${gradeTarget?.student?.firstName} ${gradeTarget?.student?.lastName}`}
        maxWidth={440}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setModal('submissions')}
            >
              Back
            </button>
            <button
              className="btn btn--primary"
              disabled={saving}
              onClick={handleGrade}
            >
              {saving ? 'Saving...' : 'Save Grade'}
            </button>
          </>
        }
      >
        <form onSubmit={handleGrade}>
          <div className="form-group">
            <label>Score (out of {selected?.totalMarks}) *</label>
            <input
              type="number"
              min={0}
              max={selected?.totalMarks}
              className="form-control"
              required
              value={gradeForm.score}
              onChange={(e) =>
                setGradeForm((f) => ({ ...f, score: e.target.value }))
              }
            />
            {gradeForm.score !== '' && (
              <div
                style={{
                  marginTop: 8,
                  fontWeight: 600,
                  color: 'var(--clr-text-2)',
                }}
              >
                {((gradeForm.score / selected?.totalMarks) * 100).toFixed(0)}% —{' '}
                <span style={{ color: 'var(--clr-primary)' }}>
                  {(gradeForm.score / selected?.totalMarks) * 100 >= 70
                    ? 'Excellent'
                    : (gradeForm.score / selected?.totalMarks) * 100 >= 50
                      ? 'Good'
                      : 'Needs improvement'}
                </span>
              </div>
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Feedback / Comments</label>
            <textarea
              className="form-control"
              rows={4}
              value={gradeForm.feedback}
              onChange={(e) =>
                setGradeForm((f) => ({ ...f, feedback: e.target.value }))
              }
              placeholder="Write constructive feedback for the student..."
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Assignment"
        message="This will remove the assignment. Existing submissions will be preserved but students won't be able to make new submissions."
        confirmLabel="Remove"
        danger
      />
    </>
  );
}
