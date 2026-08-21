import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Inbox,
  PlayCircle,
  Send,
  RotateCcw,
  ClipboardList,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, formatDistanceToNowStrict } from 'date-fns';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import { taskService } from '../../services/api';

const STATUS_COLORS = {
  Pending: '#6B7280',
  'In Progress': '#0891B2',
  Submitted: '#F59E0B',
  Rejected: '#EF4444',
  Completed: '#10B981',
  Cancelled: '#9CA3AF',
};

const PRIORITY_COLORS = {
  Low: '#6B7280',
  Normal: '#1A4FAB',
  High: '#F59E0B',
  Urgent: '#EF4444',
};

// The tabs a teacher actually thinks in: what I owe, what is with the office,
// and what is finished.
const TABS = [
  {
    key: 'open',
    label: 'To do',
    statuses: ['Pending', 'In Progress', 'Rejected'],
  },
  { key: 'waiting', label: 'Awaiting approval', statuses: ['Submitted'] },
  { key: 'done', label: 'Closed', statuses: ['Completed', 'Cancelled'] },
];

const isOverdue = (task) =>
  !['Completed', 'Cancelled', 'Submitted'].includes(task.status) &&
  task.dueDate &&
  new Date(task.dueDate) < new Date();

export default function MyTasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState('open');
  const [page, setPage] = useState(1);
  const [tasks, setTasks] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);

    // The API filters by a single status, and a tab covers several, so the
    // whole page is fetched and grouped here rather than firing one request
    // per status.
    Promise.all([
      taskService.getAll({ page, limit: 50 }),
      taskService.getStats(),
    ])
      .then(([listRes, statsRes]) => {
        setTasks(listRes.data?.data || []);
        setMeta(
          listRes.data?.meta || { page: 1, pages: 1, total: 0, limit: 50 },
        );
        setStats(statsRes.data?.data?.stats || null);
      })
      .catch((err) =>
        toast.error(err.response?.data?.message || 'Failed to load your tasks'),
      )
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  // A search hit deep-links to one task — jump to the tab that holds it.
  const focusedId = searchParams.get('task');
  useEffect(() => {
    if (!focusedId || !tasks.length) return;

    const match = tasks.find((task) => task._id === focusedId);
    if (!match) return;

    const owner = TABS.find((t) => t.statuses.includes(match.status));
    if (owner) setTab(owner.key);
  }, [focusedId, tasks]);

  const start = async (task) => {
    try {
      await taskService.start(task._id);
      toast.success('Marked as in progress');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not start the task');
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const { data } = await taskService.submit(submitting._id, {
        note: note.trim() || undefined,
      });

      toast.success(data.message || 'Submitted');
      setSubmitting(null);
      setNote('');
      if (focusedId) setSearchParams({});
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit the task');
    } finally {
      setSaving(false);
    }
  };

  const activeTab = TABS.find((t) => t.key === tab);
  const visible = tasks.filter((task) =>
    activeTab.statuses.includes(task.status),
  );

  const tiles = stats
    ? [
        {
          label: 'To do',
          value:
            (stats.Pending || 0) +
            (stats['In Progress'] || 0) +
            (stats.Rejected || 0),
          color: STATUS_COLORS['In Progress'],
          icon: Inbox,
        },
        {
          label: 'Awaiting approval',
          value: stats.Submitted || 0,
          color: STATUS_COLORS.Submitted,
          icon: Clock,
        },
        {
          label: 'Overdue',
          value: stats.overdue || 0,
          color: '#EF4444',
          icon: AlertTriangle,
        },
        {
          label: 'Completed',
          value: stats.Completed || 0,
          color: STATUS_COLORS.Completed,
          icon: CheckCircle2,
        },
      ]
    : [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">My Tasks</h1>
          <p className="page-header__subtitle">
            Work assigned to you by the school office
          </p>
        </div>
      </div>

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
                <div className="stat-card__value">{tile.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div
        style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}
      >
        {TABS.map((t) => {
          const count = tasks.filter((task) =>
            t.statuses.includes(task.status),
          ).length;

          return (
            <button
              key={t.key}
              className={`btn btn--sm ${tab === t.key ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {count > 0 && ` (${count})`}
            </button>
          );
        })}
      </div>

      {/* ── List ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="card">
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: 64 }}
          >
            <div className="spinner" />
          </div>
        </div>
      ) : !visible.length ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '56px 24px' }}>
            <ClipboardList size={44} className="empty-state__icon" />
            <p className="empty-state__title">Nothing here</p>
            <p className="empty-state__text">
              {tab === 'open'
                ? 'You have no outstanding tasks. '
                : 'No tasks in this list yet.'}
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {visible.map((task) => {
            const overdue = isOverdue(task);
            const highlighted = task._id === focusedId;

            return (
              <div
                key={task._id}
                className="card"
                style={{
                  borderLeft: `4px solid ${STATUS_COLORS[task.status]}`,
                  outline: highlighted
                    ? '2px solid var(--clr-primary)'
                    : 'none',
                }}
              >
                <div className="card__body">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        <h3 style={{ fontSize: '1.0625rem', margin: 0 }}>
                          {task.title}
                        </h3>
                        <span
                          className="badge"
                          style={{
                            background: `${STATUS_COLORS[task.status]}18`,
                            color: STATUS_COLORS[task.status],
                            fontWeight: 600,
                          }}
                        >
                          {task.status}
                        </span>
                        <span
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: PRIORITY_COLORS[task.priority],
                          }}
                        >
                          {task.priority}
                        </span>
                      </div>

                      {task.description && (
                        <p
                          style={{
                            marginTop: 8,
                            fontSize: '0.9375rem',
                            color: 'var(--clr-text-2)',
                          }}
                        >
                          {task.description}
                        </p>
                      )}

                      <div
                        style={{
                          marginTop: 10,
                          fontSize: '0.8125rem',
                          color: overdue ? '#EF4444' : 'var(--clr-text-3)',
                          display: 'flex',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>
                          Due{' '}
                          {task.dueDate
                            ? format(new Date(task.dueDate), 'dd MMM yyyy')
                            : '—'}
                          {task.dueDate &&
                            ` · ${formatDistanceToNowStrict(
                              new Date(task.dueDate),
                              { addSuffix: true },
                            )}`}
                        </span>
                        <span>{task.category}</span>
                        {task.relatedClass && (
                          <span>{task.relatedClass.name}</span>
                        )}
                        {task.relatedSubject && (
                          <span>{task.relatedSubject.name}</span>
                        )}
                        {task.assignedBy && (
                          <span>
                            From {task.assignedBy.firstName}{' '}
                            {task.assignedBy.lastName}
                          </span>
                        )}
                      </div>

                      {/* A rejection is only useful if the reason travels with it. */}
                      {task.status === 'Rejected' && task.review?.comment && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 'var(--radius-md)',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: '#b91c1c',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Sent back
                          </div>
                          <p
                            style={{
                              margin: '4px 0 0',
                              fontSize: '0.9375rem',
                              color: '#7f1d1d',
                            }}
                          >
                            {task.review.comment}
                          </p>
                        </div>
                      )}

                      {task.status === 'Submitted' &&
                        task.submission?.submittedAt && (
                          <div
                            style={{
                              marginTop: 10,
                              fontSize: '0.8125rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            Handed in{' '}
                            {format(
                              new Date(task.submission.submittedAt),
                              'dd MMM yyyy, HH:mm',
                            )}
                          </div>
                        )}

                      {task.status === 'Completed' && task.review?.comment && (
                        <div
                          style={{
                            marginTop: 10,
                            fontSize: '0.875rem',
                            color: 'var(--clr-text-2)',
                          }}
                        >
                          “{task.review.comment}”
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                      }}
                    >
                      {task.status === 'Pending' && (
                        <button
                          className="btn btn--secondary btn--sm"
                          onClick={() => start(task)}
                        >
                          <PlayCircle size={14} />
                          Start
                        </button>
                      )}

                      {['Pending', 'In Progress', 'Rejected'].includes(
                        task.status,
                      ) && (
                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => {
                            setSubmitting(task);
                            setNote('');
                          }}
                        >
                          {task.status === 'Rejected' ? (
                            <>
                              <RotateCcw size={14} />
                              Resubmit
                            </>
                          ) : (
                            <>
                              <Send size={14} />
                              {task.requiresApproval
                                ? 'Submit for approval'
                                : 'Mark complete'}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {meta.pages > 1 && (
        <div className="card" style={{ marginTop: 16 }}>
          <Pagination
            page={meta.page}
            pages={meta.pages}
            total={meta.total}
            limit={meta.limit}
            onChange={setPage}
          />
        </div>
      )}

      {/* ── Submit ────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(submitting)}
        onClose={() => setSubmitting(null)}
        title={
          submitting?.requiresApproval ? 'Submit for approval' : 'Mark complete'
        }
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setSubmitting(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={submit}
              disabled={saving}
            >
              {saving ? 'Sending…' : 'Confirm'}
            </button>
          </>
        }
      >
        {submitting && (
          <>
            <h4 style={{ marginBottom: 12 }}>{submitting.title}</h4>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>
                Note{' '}
                <span style={{ color: 'var(--clr-text-3)', fontWeight: 400 }}>
                  (optional)
                </span>
              </label>
              <textarea
                className="form-control"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything the office should know — where the file is, what is outstanding…"
              />
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
