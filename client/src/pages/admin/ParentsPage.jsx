import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Link2,
  Unlink,
  UserCheck,
  UserX,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { parentService, userService } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Pagination from '../../components/common/Pagination';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import useQuickAction from '../../utils/useQuickAction';

const RELATIONSHIPS = ['Father', 'Mother', 'Guardian', 'Other'];

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  role: 'Parent',
  parentProfile: { occupation: '', relationship: 'Guardian' },
};

// ── Small avatar ──────────────────────────────────────────────────────────────
function Avatar({ user, size = 32, color = '#059669', bg = '#d1fae5' }) {
  if (!user) return null;
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: user.avatar?.url ? 'transparent' : bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.34,
        color,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {user.avatar?.url ? (
        <img
          src={user.avatar.url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials
      )}
    </div>
  );
}

export default function ParentsPage() {
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [expanded, setExpanded] = useState(null);

  // Create / Edit modal
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [childrenToLink, setChildrenToLink] = useState([]); // student IDs selected on create
  const [saving, setSaving] = useState(false);

  // Link modal
  const [linkModal, setLinkModal] = useState(null); // parent object
  const [studentSearch, setStudentSearch] = useState('');
  const [unlinkedStudents, setUnlinkedStudents] = useState([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [linkingId, setLinkingId] = useState(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 12 };
      if (search) params.search = search;
      const res = await parentService.getAll(params);
      setParents(res.data.data);
      setMeta(res.data.meta || { total: 0, pages: 1 });
    } catch {
      toast.error('Failed to load parents');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Search unlinked students ──────────────────────────────────────────────
  const searchUnlinked = useCallback(async (q) => {
    setSearchingStudents(true);
    try {
      const res = await parentService.getUnlinkedStudents({ search: q });
      setUnlinkedStudents(res.data.data?.students || []);
    } catch {
      /* silent */
    } finally {
      setSearchingStudents(false);
    }
  }, []);

  useEffect(() => {
    if (linkModal) searchUnlinked(studentSearch);
  }, [linkModal, studentSearch]);

  // ── Open Create ───────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setChildrenToLink([]);
    setSelected(null);
    setModal('form');
    searchUnlinked('');
  };
  useQuickAction('parent', openCreate);

  // ── Open Edit ─────────────────────────────────────────────────────────────
  const openEdit = (p) => {
    setSelected(p);
    setForm({
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone || '',
      role: 'Parent',
      parentProfile: {
        occupation: p.parentProfile?.occupation || '',
        relationship: p.parentProfile?.relationship || 'Guardian',
      },
    });
    setModal('form');
  };

  const setField = (path, val) => {
    const keys = path.split('.');
    if (keys.length === 1) setForm((f) => ({ ...f, [path]: val }));
    else
      setForm((f) => ({ ...f, [keys[0]]: { ...f[keys[0]], [keys[1]]: val } }));
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (!selected) {
        await parentService.create({ ...form, childrenIds: childrenToLink });
        toast.success('Parent account created — welcome email sent');
      } else {
        await parentService.update(selected._id, form);
        toast.success('Parent updated');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle child selection during create ──────────────────────────────────
  const toggleChildLink = (id) =>
    setChildrenToLink((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );

  // ── Link / unlink from link modal ─────────────────────────────────────────
  const handleLink = async (studentId) => {
    setLinkingId(studentId);
    try {
      const res = await parentService.linkChild(linkModal._id, studentId);
      toast.success('Student linked');
      // Update local parent record
      setParents((ps) =>
        ps.map((p) =>
          p._id === linkModal._id
            ? {
                ...p,
                parentProfile: {
                  ...p.parentProfile,
                  children: res.data.data.children,
                },
              }
            : p,
        ),
      );
      setLinkModal((prev) => ({
        ...prev,
        parentProfile: {
          ...prev.parentProfile,
          children: res.data.data.children,
        },
      }));
      searchUnlinked(studentSearch); // refresh unlinked list
    } catch (err) {
      toast.error(err.response?.data?.message || 'Link failed');
    } finally {
      setLinkingId(null);
    }
  };

  const handleUnlink = async (parentObj, studentId) => {
    setLinkingId(studentId);
    try {
      const res = await parentService.unlinkChild(parentObj._id, studentId);
      toast.success('Student unlinked');
      setParents((ps) =>
        ps.map((p) =>
          p._id === parentObj._id
            ? {
                ...p,
                parentProfile: {
                  ...p.parentProfile,
                  children: res.data.data.children,
                },
              }
            : p,
        ),
      );
      if (linkModal?._id === parentObj._id) {
        setLinkModal((prev) => ({
          ...prev,
          parentProfile: {
            ...prev.parentProfile,
            children: res.data.data.children,
          },
        }));
        searchUnlinked(studentSearch);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Unlink failed');
    } finally {
      setLinkingId(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await parentService.delete(deleteTarget);
      toast.success('Parent deleted');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  // ── Toggle row expand ─────────────────────────────────────────────────────
  const toggleExpand = (id) => setExpanded((p) => (p === id ? null : id));

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Parents & Guardians</h1>
          <p className="page-header__subtitle">{meta.total} parent accounts</p>
        </div>
        <button className="btn btn--primary" onClick={openCreate}>
          <Plus size={16} /> Add Parent
        </button>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--clr-text-3)',
            }}
          />
          <input
            className="form-control"
            style={{ paddingLeft: 36 }}
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Info banner */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <Users
          size={18}
          color="#2563eb"
          style={{ flexShrink: 0, marginTop: 1 }}
        />
        <div style={{ fontSize: '0.875rem', color: '#1e40af' }}>
          <strong>How Parent Accounts Work:</strong> Create a parent account and
          immediately link one or more students to it. The parent's login gives
          them a read-only dashboard showing their linked children's results,
          attendance, and fee status. Use the <strong>Manage Children</strong>{' '}
          button to link or unlink students at any time.
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div
          className="table-wrapper"
          style={{ border: 'none', borderRadius: 0 }}
        >
          <table className="table">
            <thead>
              <tr>
                <th>Parent / Guardian</th>
                <th>Relationship</th>
                <th>Children Linked</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 48 }}>
                    <div className="spinner" style={{ margin: '0 auto' }} />
                  </td>
                </tr>
              ) : parents.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 60 }}>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <Users
                        size={40}
                        color="var(--clr-text-3)"
                        style={{ opacity: 0.4 }}
                      />
                      <p style={{ color: 'var(--clr-text-3)' }}>
                        No parent accounts yet
                      </p>
                      <button
                        className="btn btn--primary btn--sm"
                        onClick={openCreate}
                      >
                        <Plus size={14} /> Create first parent
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                parents.map((parent) => {
                  const children = parent.parentProfile?.children || [];
                  const isExpanded = expanded === parent._id;

                  return (
                    <React.Fragment key={parent._id}>
                      <tr>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <Avatar user={parent} size={36} />
                            <div>
                              <div style={{ fontWeight: 600 }}>
                                {parent.firstName} {parent.lastName}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.8125rem',
                                  color: 'var(--clr-text-3)',
                                }}
                              >
                                {parent.email}
                              </div>
                              {parent.phone && (
                                <div
                                  style={{
                                    fontSize: '0.8125rem',
                                    color: 'var(--clr-text-3)',
                                  }}
                                >
                                  {parent.phone}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge--neutral">
                            {parent.parentProfile?.relationship || 'Guardian'}
                          </span>
                        </td>
                        <td>
                          {children.length === 0 ? (
                            <span
                              style={{
                                color: 'var(--clr-warning)',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                              }}
                            >
                              ⚠ No children linked
                            </span>
                          ) : (
                            <button
                              onClick={() => toggleExpand(parent._id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: 0,
                              }}
                            >
                              <div style={{ display: 'flex', gap: -4 }}>
                                {children.slice(0, 3).map((child, i) => (
                                  <div
                                    key={child._id}
                                    style={{
                                      marginLeft: i > 0 ? -8 : 0,
                                      border: '2px solid #fff',
                                      borderRadius: '50%',
                                    }}
                                  >
                                    <Avatar
                                      user={child}
                                      size={26}
                                      color="#1e40af"
                                      bg="#dbeafe"
                                    />
                                  </div>
                                ))}
                              </div>
                              <span
                                style={{
                                  fontSize: '0.875rem',
                                  fontWeight: 600,
                                  color: 'var(--clr-text-2)',
                                }}
                              >
                                {children.length}{' '}
                                {children.length === 1 ? 'child' : 'children'}
                              </span>
                              {isExpanded ? (
                                <ChevronUp size={14} />
                              ) : (
                                <ChevronDown size={14} />
                              )}
                            </button>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge badge--${parent.isActive ? 'success' : 'danger'}`}
                          >
                            {parent.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td
                          style={{
                            fontSize: '0.875rem',
                            color: 'var(--clr-text-3)',
                          }}
                        >
                          {parent.lastLogin
                            ? format(new Date(parent.lastLogin), 'dd MMM yyyy')
                            : 'Never'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn--ghost btn--sm"
                              onClick={() => setLinkModal(parent)}
                              title="Manage linked children"
                              style={{
                                color: 'var(--clr-primary)',
                                fontWeight: 500,
                                gap: 4,
                              }}
                            >
                              <Link2 size={13} /> Manage Children
                            </button>
                            <button
                              className="btn btn--ghost btn--sm btn--icon"
                              onClick={() => openEdit(parent)}
                              title="Edit parent"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              className="btn btn--ghost btn--sm btn--icon"
                              style={{ color: 'var(--clr-danger)' }}
                              onClick={() => setDeleteTarget(parent._id)}
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded children row */}
                      {isExpanded && children.length > 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            style={{ padding: 0, background: '#f8faff' }}
                          >
                            <div style={{ padding: '12px 20px 16px 60px' }}>
                              <div
                                style={{
                                  fontSize: '0.8125rem',
                                  fontWeight: 600,
                                  color: 'var(--clr-text-3)',
                                  marginBottom: 10,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                Linked Children
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 12,
                                  flexWrap: 'wrap',
                                }}
                              >
                                {children.map((child) => (
                                  <div
                                    key={child._id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 10,
                                      padding: '8px 14px',
                                      background: '#fff',
                                      border: '1px solid var(--clr-border)',
                                      borderRadius: 'var(--radius-md)',
                                    }}
                                  >
                                    <Avatar
                                      user={child}
                                      size={30}
                                      color="#1e40af"
                                      bg="#dbeafe"
                                    />
                                    <div>
                                      <div
                                        style={{
                                          fontWeight: 600,
                                          fontSize: '0.875rem',
                                        }}
                                      >
                                        {child.firstName} {child.lastName}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: '0.75rem',
                                          color: 'var(--clr-text-3)',
                                        }}
                                      >
                                        {child.studentProfile?.class?.name ||
                                          'No class'}{' '}
                                        •{' '}
                                        {child.studentProfile
                                          ?.admissionNumber ||
                                          'No admission no.'}
                                      </div>
                                    </div>
                                    <button
                                      className="btn btn--ghost btn--sm btn--icon"
                                      style={{
                                        color: 'var(--clr-danger)',
                                        marginLeft: 4,
                                      }}
                                      onClick={() =>
                                        handleUnlink(parent, child._id)
                                      }
                                      disabled={linkingId === child._id}
                                      title="Unlink student"
                                    >
                                      <Unlink size={13} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pages={meta.pages}
          total={meta.total}
          limit={12}
          onChange={setPage}
        />
      </div>

      {/* ──────────────── Create / Edit Modal ──────────────────────────────── */}
      <Modal
        open={modal === 'form'}
        onClose={() => setModal(null)}
        title={selected ? 'Edit Parent Account' : 'Create Parent Account'}
        maxWidth={600}
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
              onClick={handleSave}
            >
              {saving
                ? 'Saving...'
                : selected
                  ? 'Save Changes'
                  : 'Create & Send Welcome Email'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSave}>
          {/* Personal info */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
              marginBottom: 14,
            }}
          >
            {[
              ['firstName', 'First Name'],
              ['lastName', 'Last Name'],
            ].map(([f, l]) => (
              <div className="form-group" key={f} style={{ marginBottom: 0 }}>
                <label>{l} *</label>
                <input
                  className="form-control"
                  required
                  value={form[f]}
                  onChange={(e) => setField(f, e.target.value)}
                />
              </div>
            ))}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Email Address *</label>
              <input
                type="email"
                className="form-control"
                required
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Phone Number</label>
              <input
                type="tel"
                className="form-control"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="+234 800 000 0000"
              />
            </div>
            {!selected && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>
                  Password *{' '}
                  <span
                    style={{
                      fontWeight: 400,
                      color: 'var(--clr-text-3)',
                      fontSize: '0.8rem',
                    }}
                  >
                    (min. 8 chars)
                  </span>
                </label>
                <input
                  type="password"
                  className="form-control"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                />
              </div>
            )}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Relationship to Student</label>
              <select
                className="form-control"
                value={form.parentProfile.relationship}
                onChange={(e) =>
                  setField('parentProfile.relationship', e.target.value)
                }
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Occupation</label>
              <input
                className="form-control"
                value={form.parentProfile.occupation}
                onChange={(e) =>
                  setField('parentProfile.occupation', e.target.value)
                }
                placeholder="e.g. Engineer"
              />
            </div>
          </div>

          {/* Link children on create */}
          {!selected && (
            <div
              style={{
                borderTop: '1px solid var(--clr-border)',
                paddingTop: 16,
              }}
            >
              <label
                style={{
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <Link2 size={15} /> Link Children (optional — can be done later)
              </label>
              <p
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--clr-text-3)',
                  marginBottom: 12,
                }}
              >
                Showing students without a linked parent account. Select the
                children belonging to this parent.
              </p>
              <UnlinkedStudentPicker
                onSearch={searchUnlinked}
                students={unlinkedStudents}
                loading={searchingStudents}
                selected={childrenToLink}
                onToggle={toggleChildLink}
              />
            </div>
          )}
        </form>
      </Modal>

      {/* ──────────────── Manage Children (Link) Modal ─────────────────────── */}
      <Modal
        open={!!linkModal}
        onClose={() => {
          setLinkModal(null);
          setStudentSearch('');
          load();
        }}
        title={`Manage Children — ${linkModal?.firstName} ${linkModal?.lastName}`}
        maxWidth={660}
        footer={
          <button
            className="btn btn--primary"
            onClick={() => {
              setLinkModal(null);
              setStudentSearch('');
              load();
            }}
          >
            Done
          </button>
        }
      >
        {linkModal && (
          <div>
            {/* Currently linked */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--clr-text-2)',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <UserCheck size={15} color="var(--clr-success)" /> Currently
                Linked Children
              </div>
              {(linkModal.parentProfile?.children || []).length === 0 ? (
                <div
                  style={{
                    padding: '12px 16px',
                    background: '#fef3c7',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.875rem',
                    color: '#92400e',
                  }}
                >
                  No children linked yet. Search and add students below.
                </div>
              ) : (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {(linkModal.parentProfile?.children || []).map((child) => (
                    <div
                      key={child._id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <Avatar
                        user={child}
                        size={34}
                        color="#065f46"
                        bg="#d1fae5"
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>
                          {child.firstName} {child.lastName}
                        </div>
                        <div
                          style={{ fontSize: '0.8125rem', color: '#065f46' }}
                        >
                          {child.studentProfile?.class?.name || 'No class'} •{' '}
                          {child.studentProfile?.admissionNumber || '—'}
                        </div>
                      </div>
                      <button
                        className="btn btn--sm"
                        style={{
                          background: '#fee2e2',
                          color: '#dc2626',
                          border: 'none',
                          gap: 4,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        onClick={() => handleUnlink(linkModal, child._id)}
                        disabled={linkingId === child._id}
                      >
                        <Unlink size={13} />
                        {linkingId === child._id ? 'Unlinking...' : 'Unlink'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Search and add */}
            <div
              style={{
                borderTop: '1px solid var(--clr-border)',
                paddingTop: 16,
              }}
            >
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--clr-text-2)',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Plus size={15} color="var(--clr-primary)" /> Add More Children
              </div>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 11,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--clr-text-3)',
                  }}
                />
                <input
                  className="form-control"
                  style={{ paddingLeft: 34 }}
                  placeholder="Search student by name or admission number..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {searchingStudents ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      padding: 24,
                    }}
                  >
                    <div
                      className="spinner"
                      style={{ width: 24, height: 24, borderWidth: 2 }}
                    />
                  </div>
                ) : unlinkedStudents.length === 0 ? (
                  <p
                    style={{
                      color: 'var(--clr-text-3)',
                      textAlign: 'center',
                      padding: 20,
                      fontSize: '0.875rem',
                    }}
                  >
                    {studentSearch
                      ? 'No matching students without a parent account'
                      : 'All students have parent accounts'}
                  </p>
                ) : (
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                  >
                    {unlinkedStudents.map((student) => {
                      const alreadyLinked = (
                        linkModal.parentProfile?.children || []
                      ).some((c) => (c._id || c) === student._id);
                      return (
                        <div
                          key={student._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 14px',
                            background: alreadyLinked
                              ? '#f0fdf4'
                              : 'var(--clr-bg)',
                            border: `1px solid ${alreadyLinked ? '#bbf7d0' : 'var(--clr-border)'}`,
                            borderRadius: 'var(--radius-md)',
                          }}
                        >
                          <Avatar
                            user={student}
                            size={34}
                            color="#1e40af"
                            bg="#dbeafe"
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>
                              {student.firstName} {student.lastName}
                            </div>
                            <div
                              style={{
                                fontSize: '0.8125rem',
                                color: 'var(--clr-text-3)',
                              }}
                            >
                              {student.studentProfile?.class?.name ||
                                'No class'}{' '}
                              •{' '}
                              {student.studentProfile?.admissionNumber ||
                                'No admission no.'}
                            </div>
                          </div>
                          {alreadyLinked ? (
                            <span
                              style={{
                                fontSize: '0.8rem',
                                color: 'var(--clr-success)',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <UserCheck size={14} /> Linked
                            </span>
                          ) : (
                            <button
                              className="btn btn--primary btn--sm"
                              style={{
                                gap: 4,
                                display: 'flex',
                                alignItems: 'center',
                              }}
                              onClick={() => handleLink(student._id)}
                              disabled={linkingId === student._id}
                            >
                              <Link2 size={13} />
                              {linkingId === student._id
                                ? 'Linking...'
                                : 'Link'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Confirm ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Parent Account"
        message="This will permanently delete the parent account. Their children's profiles will remain but will no longer have a linked parent. This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </>
  );
}

// ── Subcomponent: picker used inside Create form ──────────────────────────────
function UnlinkedStudentPicker({
  onSearch,
  students,
  loading,
  selected,
  onToggle,
}) {
  const [q, setQ] = useState('');
  useEffect(() => {
    onSearch(q);
  }, [q]);

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: 11,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--clr-text-3)',
          }}
        />
        <input
          className="form-control"
          style={{ paddingLeft: 34 }}
          placeholder="Search students..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div
        style={{
          maxHeight: 220,
          overflowY: 'auto',
          border: '1px solid var(--clr-border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--clr-bg)',
        }}
      >
        {loading ? (
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: 20 }}
          >
            <div
              className="spinner"
              style={{ width: 22, height: 22, borderWidth: 2 }}
            />
          </div>
        ) : students.length === 0 ? (
          <p
            style={{
              padding: 16,
              color: 'var(--clr-text-3)',
              textAlign: 'center',
              fontSize: '0.875rem',
            }}
          >
            No unlinked students found
          </p>
        ) : (
          students.map((s) => {
            const active = selected.includes(s._id);
            return (
              <div
                key={s._id}
                onClick={() => onToggle(s._id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 14px',
                  cursor: 'pointer',
                  background: active ? '#eff6ff' : 'transparent',
                  borderBottom: '1px solid var(--clr-border)',
                  transition: 'background 0.15s',
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  readOnly
                  style={{ flexShrink: 0 }}
                />
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: '#dbeafe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    color: '#1e40af',
                    flexShrink: 0,
                  }}
                >
                  {s.firstName?.[0]}
                  {s.lastName?.[0]}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    {s.firstName} {s.lastName}
                  </div>
                  <div
                    style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)' }}
                  >
                    {s.studentProfile?.class?.name || 'No class'} •{' '}
                    {s.studentProfile?.admissionNumber}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {selected.length > 0 && (
        <div
          style={{
            marginTop: 8,
            fontSize: '0.8125rem',
            color: 'var(--clr-primary)',
            fontWeight: 600,
          }}
        >
          {selected.length} student{selected.length > 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}
