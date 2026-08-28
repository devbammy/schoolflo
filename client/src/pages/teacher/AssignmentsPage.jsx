import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Trash2,
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
import { getCurrentAcademicYear } from '../../utils/academicYear';
import useQuickAction from '../../utils/useQuickAction';
import './styles/assignment.scss';

const TERMS = ['First Term', 'Second Term', 'Third Term'];
const EMPTY_FORM = {
  title: '',
  description: '',
  class: '',
  subject: '',
  term: 'First Term',
  academicYear: getCurrentAcademicYear(),
  dueDate: '',
  totalMarks: 100,
  allowLateSubmission: false,
};

const STATUS = {
  Submitted: { color: '#3B82F6', bg: '#dbeafe' },
  Graded: { color: '#10B981', bg: '#d1fae5' },
  Late: { color: '#F59E0B', bg: '#fef3c7' },
};

export default function AssignmentsPage() {
  const { user } = useAuthStore();

  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [modal, setModal] = useState(null); // create | submissions | grade
  const [selected, setSelected] = useState(null);

  const [submissions, setSubmissions] = useState([]);
  const [subLoading, setSubLoading] = useState(false);

  const [gradeTarget, setGradeTarget] = useState(null);
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' });

  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const [filters, setFilters] = useState({
    term: '',
    classId: '',
  });

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await assignmentService.getAll(filters);
      setAssignments(res.data.data.assignments || []);
    } catch {
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          classService.getAll(),
          subjectService.getAll(),
        ]);

        setClasses(cRes.data.data.classes || []);
        const allSubjects = sRes.data.data.subjects || [];

        const teacherSubjects =
          user?.teacherProfile?.subjectsTaught?.map((s) => s._id || s) || [];

        setSubjects(
          teacherSubjects.length
            ? allSubjects.filter((s) => teacherSubjects.includes(s._id))
            : allSubjects,
        );

        const teacherClass = user?.teacherProfile?.classTeacherOf;
        if (teacherClass) {
          setForm((p) => ({
            ...p,
            class: teacherClass._id || teacherClass,
          }));
        }
      } catch {
        toast.error('Failed to load metadata');
      }
    })();
  }, [user]);

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      class:
        user?.teacherProfile?.classTeacherOf?._id ||
        user?.teacherProfile?.classTeacherOf ||
        '',
    });
    setFiles([]);
    setModal('create');
  };
  useQuickAction('assignment', openCreate);

  const openSubmissions = async (assignment) => {
    setSelected(assignment);
    setModal('submissions');
    setSubLoading(true);

    try {
      const res = await submissionService.getForAssignment(assignment._id);
      setSubmissions(res.data.data.submissions || []);
    } catch {
      toast.error('Failed to load submissions');
    } finally {
      setSubLoading(false);
    }
  };

  const openGrade = (sub) => {
    setGradeTarget(sub);
    setGradeForm({
      score: sub.score || '',
      feedback: sub.feedback || '',
    });
    setModal('grade');
  };

  const createAssignment = async (e) => {
    e.preventDefault();

    if (!form.class || !form.subject)
      return toast.error('Class and subject required');
    if (!form.dueDate) return toast.error('Due date required');

    setSaving(true);
    try {
      await assignmentService.create({
        ...form,
        attachments: files,
      });

      toast.success('Assignment created');
      setModal(null);
      loadAssignments();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Creation failed');
    } finally {
      setSaving(false);
    }
  };

  const gradeSubmission = async (e) => {
    e.preventDefault();

    if (gradeForm.score === '') return toast.error('Score required');

    setSaving(true);
    try {
      await submissionService.grade(gradeTarget._id, {
        score: Number(gradeForm.score),
        feedback: gradeForm.feedback,
      });

      toast.success('Graded successfully');

      const res = await submissionService.getForAssignment(selected._id);
      setSubmissions(res.data.data.submissions || []);

      setModal('submissions');
    } catch {
      toast.error('Failed to grade');
    } finally {
      setSaving(false);
    }
  };

  const deleteAssignment = async () => {
    try {
      await assignmentService.delete(deleteTarget);
      toast.success('Deleted');
      setDeleteTarget(null);
      loadAssignments();
    } catch {
      toast.error('Delete failed');
    }
  };

  const publishAssignment = async (id) => {
    try {
      await assignmentService.publish(id);
      toast.success('Assignment published');
      loadAssignments();
    } catch {
      toast.error('Failed to publish');
    }
  };

  const renderAssignmentStatus = (dueDate) => {
    return isPast(new Date(dueDate)) ? 'Closed' : 'Active';
  };

  const renderBadge = (label, type) => (
    <span className={`badge badge--${type}`}>{label}</span>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Assignments Management</h1>
          <p className="page-header__subtitle">
            Manage coursework and grade student submissions for the current
            term.
          </p>
        </div>
        <button className="btn btn--primary" onClick={openCreate}>
          <Plus size={18} /> Create Assignment
        </button>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <select
          className="form-control"
          value={filters.term}
          onChange={(e) => setFilters((p) => ({ ...p, term: e.target.value }))}
        >
          <option value="">All Terms</option>
          {TERMS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        <select
          className="form-control"
          value={filters.classId}
          onChange={(e) =>
            setFilters((p) => ({ ...p, classId: e.target.value }))
          }
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
        <div className="loader-container">
          <div className="spinner" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <FileText size={48} className="empty-state__icon" />
            <h3 className="empty-state__title">No assignments found</h3>
            <p className="empty-state__text">
              Get started by creating your first task for this class.
            </p>
          </div>
        </div>
      ) : (
        <div className="assignment-grid">
          {assignments.map((a) => (
            <div key={a._id} className="card">
              <div className="card__body">
                <div style={{ flex: 1 }}>
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="card__title">{a.title}</h4>
                    <span
                      className={`badge badge--${a.isPublished ? 'success' : 'warning'}`}
                    >
                      {a.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </div>

                  <p className="card__desc">{a.description}</p>

                  <div className="card__meta">
                    <Clock size={14} />
                    <span>Due: {format(new Date(a.dueDate), 'PPP')}</span>
                    <span>•</span>
                    <span
                      className={
                        isPast(new Date(a.dueDate))
                          ? 'text-danger'
                          : 'text-success'
                      }
                    >
                      {renderAssignmentStatus(a.dueDate)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {!a.isPublished && (
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={() => publishAssignment(a._id)}
                    >
                      <CheckSquare size={14} /> Publish
                    </button>
                  )}
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => openSubmissions(a)}
                  >
                    <Users size={14} /> Submissions
                  </button>
                  <button
                    className="btn btn--danger btn--sm"
                    onClick={() => setDeleteTarget(a._id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
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
              onClick={createAssignment}
            >
              {saving ? 'Creating...' : 'Create Assignment'}
            </button>
          </>
        }
      >
        <form onSubmit={createAssignment}>
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
        {subLoading ? (
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
                const cfg = STATUS[s];
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
                            background: STATUS[sub.status]?.bg || '#f3f4f6',
                            color: STATUS[sub.status]?.color || '#6B7280',
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
              onClick={gradeSubmission}
            >
              {saving ? 'Saving...' : 'Save Grade'}
            </button>
          </>
        }
      >
        <form onSubmit={gradeSubmission}>
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
        onConfirm={deleteAssignment}
        title="Remove Assignment"
        message="This will remove the assignment. Existing submissions will be preserved but students won't be able to make new submissions."
        confirmLabel="Remove"
        danger
      />
    </>
  );
}
