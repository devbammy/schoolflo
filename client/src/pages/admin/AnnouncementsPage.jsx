import React, { useEffect, useState } from 'react';
import { Plus, Bell } from 'lucide-react';
import { announcementService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import useQuickAction from '../../utils/useQuickAction';

const TARGET_OPTIONS = ['All', 'Admin', 'Teacher', 'Student', 'Parent'];

export default function AnnouncementsPage() {
  const { user } = useAuthStore();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    title: '',
    body: '',
    priority: 'Normal',
    targetAudience: ['All'],
    channels: { dashboard: true, email: false, sms: false },
    publish: true,
  });
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === 'Admin';

  useQuickAction('announcement', () => setModal(true));

  const load = () =>
    announcementService
      .getAll()
      .then((r) => setList(r.data.data?.announcements || []))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await announcementService.create(form);
      toast.success('Announcement published');
      setModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Announcements</h1>
          <p className="page-header__subtitle">{list.length} announcements</p>
        </div>
        {isAdmin && (
          <button className="btn btn--primary" onClick={() => setModal(true)}>
            <Plus size={16} /> New Announcement
          </button>
        )}
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" />
        </div>
      ) : list.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Bell size={40} className="empty-state__icon" />
            <p className="empty-state__title">No announcements</p>
          </div>
        </div>
      ) : (
        <div className="announcement-grid">
          {list.map((a) => (
            <div
              key={a._id}
              className="card"
              style={{
                borderRadius: 0,
                borderLeft: `4px solid ${a.priority === 'Urgent' ? 'var(--clr-danger)' : a.priority === 'High' ? 'var(--clr-warning)' : 'var(--clr-primary)'}`,
              }}
            >
              <div className="card__body">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <div>
                    <h4 style={{ marginBottom: 4 }}>{a.title}</h4>
                    <p
                      style={{
                        fontSize: '0.9rem',
                        color: 'var(--clr-text-2)',
                        marginBottom: 10,
                      }}
                    >
                      {a.body}
                    </p>
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--clr-text-3)',
                      }}
                    >
                      By {a.author?.firstName} {a.author?.lastName} •{' '}
                      {a.publishedAt
                        ? format(new Date(a.publishedAt), 'dd MMM yyyy, h:mm a')
                        : 'Draft'}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className={`badge badge--${a.priority === 'Urgent' ? 'danger' : a.priority === 'High' ? 'warning' : 'neutral'}`}
                    >
                      {a.priority}
                    </span>
                    {(a.targetAudience || []).map((t) => (
                      <span key={t} className="badge badge--info">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setModal(false)}
        >
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal__header">
              <h3 className="modal__title">New Announcement</h3>
              <button
                className="btn btn--ghost btn--icon"
                onClick={() => setModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal__body">
                <div className="form-group">
                  <label>Title</label>
                  <input
                    className="form-control"
                    required
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Message</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    required
                    value={form.body}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, body: e.target.value }))
                    }
                  />
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 16,
                  }}
                >
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Priority</label>
                    <select
                      className="form-control"
                      value={form.priority}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, priority: e.target.value }))
                      }
                    >
                      {['Low', 'Normal', 'High', 'Urgent'].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Target Audience</label>
                    <select
                      className="form-control"
                      value={form.targetAudience[0]}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          targetAudience: [e.target.value],
                        }))
                      }
                    >
                      {TARGET_OPTIONS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 16 }}>
                  {['email', 'sms'].map((ch) => (
                    <label
                      key={ch}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={form.channels[ch]}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            channels: { ...f.channels, [ch]: e.target.checked },
                          }))
                        }
                      />
                      Send via {ch.toUpperCase()}
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal__footer">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={saving}
                >
                  {saving ? 'Publishing...' : 'Publish Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
