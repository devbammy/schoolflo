import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Inbox,
  Trash2,
  Ban,
  ClipboardList,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import {
  taskService,
  userService,
  classService,
  subjectService,
} from '../../services/api';

const STATUSES = [
  'Pending',
  'In Progress',
  'Submitted',
  'Rejected',
  'Completed',
  'Cancelled',
];

const STATUS_COLORS = {
  Pending: '#6B7280',
  'In Progress': '#0891B2',
  Submitted: '#F59E0B',
  Rejected: '#EF4444',
  Completed: '#10B981',
  Cancelled: '#9CA3AF',
};

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const PRIORITY_COLORS = {
  Low: '#6B7280',
  Normal: '#1A4FAB',
  High: '#F59E0B',
  Urgent: '#EF4444',
};

const CATEGORIES = [
  'General',
  'Result Entry',
  'Attendance',
  'Lesson Plan',
  'Report',
  'Meeting',
  'Document',
  'Other',
];

const emptyForm = () => ({
  title: '',
  description: '',
  assignees: [],
  category: 'General',
  priority: 'Normal',
  dueDate: '',
  relatedClass: '',
  relatedSubject: '',
  requiresApproval: true,
});

/**
 * Both response shapes the API uses:
 *   sendSuccess   → { data: { [key]: [...] } }
 *   sendPaginated → { data: [...] }
 */
function extractArray(response, key) {
  const data = response?.data?.data;
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data[key])) return data[key];
  return [];
}

const StatusPill = ({ status }) => (
  <span
    className="badge"
    style={{
      background: `${STATUS_COLORS[status]}18`,
      color: STATUS_COLORS[status],
      fontWeight: 600,
    }}
  >
    {status}
  </span>
);

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [tasks, setTasks] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [filters, setFilters] = useState({ status: '', priority: '' });
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [reviewing, setReviewing] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [deciding, setDeciding] = useState(false);

  // ── Reference data, loaded once ─────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      userService.getAll({ role: 'Teacher', limit: 100 }),
      classService.getAll(),
      subjectService.getAll(),
    ])
      .then(([teacherRes, classRes, subjectRes]) => {
        setTeachers(extractArray(teacherRes, 'users'));
        setClasses(extractArray(classRes, 'classes'));
        setSubjects(extractArray(subjectRes, 'subjects'));
      })
      .catch(() => toast.error('Could not load staff and class lists'));
  }, []);

  // ── Task list ───────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);

    const params = { page, limit: 20 };
    if (filters.status) params.status = filters.status;
    if (filters.priority) params.priority = filters.priority;

    Promise.all([taskService.getAll(params), taskService.getStats()])
      .then(([listRes, statsRes]) => {
        setTasks(listRes.data?.data || []);
        setMeta(
          listRes.data?.meta || { page: 1, pages: 1, total: 0, limit: 20 },
        );
        setStats(statsRes.data?.data?.stats || null);
      })
      .catch((err) =>
        toast.error(err.response?.data?.message || 'Failed to load tasks'),
      )
      .finally(() => setLoading(false));
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  // A search hit deep-links to one task; open its review panel if it is waiting.
  const focusedId = searchParams.get('task');
  useEffect(() => {
    if (!focusedId || !tasks.length) return;

    const match = tasks.find((task) => task._id === focusedId);
    if (match?.status === 'Submitted') setReviewing(match);
  }, [focusedId, tasks]);

  // ── Create ──────────────────────────────────────────────────────────────
  const submitForm = async (e) => {
    e.preventDefault();

    if (!form.assignees.length) {
      return toast.error('Choose at least one member of staff');
    }

    setSaving(true);
    try {
      const { data } = await taskService.create({
        ...form,
        relatedClass: form.relatedClass || undefined,
        relatedSubject: form.relatedSubject || undefined,
      });

      toast.success(data.message || 'Task assigned');
      setFormOpen(false);
      setForm(emptyForm());
      setPage(1);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not assign the task');
    } finally {
      setSaving(false);
    }
  };

  // ── Review ──────────────────────────────────────────────────────────────
  const decide = async (decision) => {
    if (decision === 'rejected' && reviewComment.trim().length < 3) {
      return toast.error('Say why the task is being sent back');
    }

    setDeciding(true);
    try {
      await taskService.review(reviewing._id, {
        decision,
        comment: reviewComment.trim() || undefined,
      });

      toast.success(
        decision === 'approved' ? 'Task approved' : 'Task sent back',
      );
      setReviewing(null);
      setReviewComment('');
      // Clear the deep link, or reopening the panel fights the reviewer.
      if (focusedId) setSearchParams({});
      load();
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Could not record the decision',
      );
    } finally {
      setDeciding(false);
    }
  };

  const withdraw = async (task) => {
    try {
      await taskService.cancel(task._id, {});
      toast.success('Task withdrawn');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not withdraw the task');
    }
  };

  const remove = async (task) => {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`))
      return;

    try {
      await taskService.delete(task._id);
      toast.success('Task deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete the task');
    }
  };

  const toggleAssignee = (id) =>
    setForm((f) => ({
      ...f,
      assignees: f.assignees.includes(id)
        ? f.assignees.filter((a) => a !== id)
        : [...f.assignees, id],
    }));

  const tiles = useMemo(
    () =>
      stats
        ? [
            {
              label: 'Awaiting approval',
              value: stats.Submitted,
              color: STATUS_COLORS.Submitted,
              icon: Inbox,
            },
            {
              label: 'In progress',
              value: stats['In Progress'],
              color: STATUS_COLORS['In Progress'],
              icon: Clock,
            },
            {
              label: 'Overdue',
              value: stats.overdue,
              color: '#EF4444',
              icon: AlertTriangle,
            },
            {
              label: 'Completed',
              value: stats.Completed,
              color: STATUS_COLORS.Completed,
              icon: CheckCircle2,
            },
          ]
        : [],
    [stats],
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Tasks &amp; Approvals</h1>
          <p className="page-header__subtitle">
            Assign work to staff and sign it off when it comes back
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setFormOpen(true)}>
          <Plus size={16} />
          Assign Task
        </button>
      </div>

      {/* ── Tiles ─────────────────────────────────────────────────────── */}
      {stats && (
        <div className="stats-grid">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="stat-card"
              style={{ '--accent-color': tile.color }}
            >
              <div className="stat-card__icon">
                <tile.icon size={22} />
              </div>
              <div className="stat-card__content">
                <div className="stat-card__label">{tile.label}</div>
                <div className="stat-card__value">{tile.value ?? 0}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div
          className="card__body"
          style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}
        >
          <div
            className="form-group"
            style={{ marginBottom: 0, minWidth: 180 }}
          >
            <label>Status</label>
            <select
              className="form-control"
              value={filters.status}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, status: e.target.value }));
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div
            className="form-group"
            style={{ marginBottom: 0, minWidth: 180 }}
          >
            <label>Priority</label>
            <select
              className="form-control"
              value={filters.priority}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, priority: e.target.value }));
              }}
            >
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── List ──────────────────────────────────────────────────────── */}
      <div className="card">
        {loading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: 64,
            }}
          >
            <div className="spinner" />
          </div>
        ) : !tasks.length ? (
          <div className="empty-state" style={{ padding: '56px 24px' }}>
            <ClipboardList size={44} className="empty-state__icon" />
            <p className="empty-state__title">No tasks yet</p>
            <p className="empty-state__text">
              Assign one to a teacher and it will appear here with its status.
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Assigned to</th>
                    <th>Due</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const overdue =
                      task.isOverdue ||
                      (!['Completed', 'Cancelled', 'Submitted'].includes(
                        task.status,
                      ) &&
                        new Date(task.dueDate) < new Date());

                    return (
                      <tr key={task._id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{task.title}</div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            {task.category}
                            {task.relatedClass
                              ? ` · ${task.relatedClass.name}`
                              : ''}
                            {task.relatedSubject
                              ? ` · ${task.relatedSubject.name}`
                              : ''}
                          </div>
                        </td>
                        <td>
                          {task.assignedTo
                            ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`
                            : '—'}
                        </td>
                        <td>
                          <span
                            style={{ color: overdue ? '#EF4444' : 'inherit' }}
                          >
                            {task.dueDate
                              ? format(new Date(task.dueDate), 'dd MMM yyyy')
                              : '—'}
                          </span>
                          {overdue && (
                            <div
                              style={{ fontSize: '0.75rem', color: '#EF4444' }}
                            >
                              Overdue
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              color: PRIORITY_COLORS[task.priority],
                              fontWeight: 600,
                              fontSize: '0.875rem',
                            }}
                          >
                            {task.priority}
                          </span>
                        </td>
                        <td>
                          <StatusPill status={task.status} />
                        </td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              justifyContent: 'flex-end',
                            }}
                          >
                            {task.status === 'Submitted' && (
                              <button
                                className="btn btn--primary btn--sm"
                                onClick={() => {
                                  setReviewing(task);
                                  setReviewComment('');
                                }}
                              >
                                Review
                              </button>
                            )}
                            {!['Completed', 'Cancelled'].includes(
                              task.status,
                            ) && (
                              <button
                                className="btn btn--secondary btn--sm btn--icon"
                                title="Withdraw"
                                onClick={() => withdraw(task)}
                              >
                                <Ban size={14} />
                              </button>
                            )}
                            <button
                              className="btn btn--secondary btn--sm btn--icon"
                              title="Delete"
                              onClick={() => remove(task)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={meta.page}
              pages={meta.pages}
              total={meta.total}
              limit={meta.limit}
              onChange={setPage}
            />
          </>
        )}
      </div>

      {/* ── Assign ────────────────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Assign a task"
        maxWidth={640}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={submitForm}
              disabled={saving}
            >
              {saving ? 'Assigning…' : 'Assign Task'}
            </button>
          </>
        }
      >
        <form onSubmit={submitForm}>
          <div className="form-group">
            <label>Title</label>
            <input
              className="form-control"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Submit JSS2 broadsheet"
              required
              minLength={3}
            />
          </div>

          <div className="form-group">
            <label>Details</label>
            <textarea
              className="form-control"
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="What exactly needs doing?"
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
            }}
          >
            <div className="form-group">
              <label>Due date</label>
              <input
                type="date"
                className="form-control"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Priority</label>
              <select
                className="form-control"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Category</label>
              <select
                className="form-control"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
          >
            <div className="form-group">
              <label>Class (optional)</label>
              <select
                className="form-control"
                value={form.relatedClass}
                onChange={(e) =>
                  setForm({ ...form, relatedClass: e.target.value })
                }
              >
                <option value="">None</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Subject (optional)</label>
              <select
                className="form-control"
                value={form.relatedSubject}
                onChange={(e) =>
                  setForm({ ...form, relatedSubject: e.target.value })
                }
              >
                <option value="">None</option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>
              Assign to{' '}
              <span style={{ color: 'var(--clr-text-3)', fontWeight: 400 }}>
                ({form.assignees.length} selected)
              </span>
            </label>
            <div
              style={{
                maxHeight: 180,
                overflowY: 'auto',
                border: '1px solid var(--clr-border)',
                borderRadius: 'var(--radius-md)',
                padding: 8,
              }}
            >
              {teachers.length === 0 && (
                <p style={{ color: 'var(--clr-text-3)', padding: 8 }}>
                  No teachers on record yet.
                </p>
              )}
              {teachers.map((teacher) => (
                <label
                  key={teacher._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 8px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.assignees.includes(teacher._id)}
                    onChange={() => toggleAssignee(teacher._id)}
                  />
                  <span style={{ fontSize: '0.9375rem' }}>
                    {teacher.firstName} {teacher.lastName}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: '0.8125rem',
                      color: 'var(--clr-text-3)',
                    }}
                  >
                    {teacher.teacherProfile?.staffId || teacher.email}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={form.requiresApproval}
              onChange={(e) =>
                setForm({ ...form, requiresApproval: e.target.checked })
              }
            />
            <span style={{ fontSize: '0.9375rem' }}>
              Needs my approval before it counts as done
            </span>
          </label>
        </form>
      </Modal>

      {/* ── Review ────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        title="Review submission"
        maxWidth={560}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => decide('rejected')}
              disabled={deciding}
            >
              <XCircle size={15} />
              Send back
            </button>
            <button
              className="btn btn--primary"
              onClick={() => decide('approved')}
              disabled={deciding}
            >
              <CheckCircle2 size={15} />
              Approve
            </button>
          </>
        }
      >
        {reviewing && (
          <>
            <h4 style={{ marginBottom: 4 }}>{reviewing.title}</h4>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--clr-text-3)',
                marginBottom: 16,
              }}
            >
              {reviewing.assignedTo?.firstName} {reviewing.assignedTo?.lastName}
              {reviewing.submission?.submittedAt &&
                ` · handed in ${format(
                  new Date(reviewing.submission.submittedAt),
                  'dd MMM yyyy, HH:mm',
                )}`}
              {reviewing.submission?.attempt > 1 &&
                ` · attempt ${reviewing.submission.attempt}`}
            </p>

            {reviewing.description && (
              <div style={{ marginBottom: 16 }}>
                <div className="text-sm text-muted">What was asked for</div>
                <p style={{ fontSize: '0.9375rem' }}>{reviewing.description}</p>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div className="text-sm text-muted">Their note</div>
              <p style={{ fontSize: '0.9375rem' }}>
                {reviewing.submission?.note || (
                  <em style={{ color: 'var(--clr-text-3)' }}>
                    No note was left.
                  </em>
                )}
              </p>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>
                Comment{' '}
                <span style={{ color: 'var(--clr-text-3)', fontWeight: 400 }}>
                  (required to send back)
                </span>
              </label>
              <textarea
                className="form-control"
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="What needs fixing, or a note on approval"
              />
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
