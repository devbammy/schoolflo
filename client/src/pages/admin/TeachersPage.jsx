import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  UserCheck,
  UserX,
  BookOpen,
} from 'lucide-react';
import { userService, classService, subjectService } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Pagination from '../../components/common/Pagination';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  role: 'Teacher',
  teacherProfile: {
    staffId: '',
    qualification: '',
    specialization: '',
    experience: '',
    designation: '',
    classTeacherOf: '',
  },
};

export default function TeachersPage() {
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { role: 'Teacher', page, limit: 15 };
      if (search) params.search = search;
      const res = await userService.getAll(params);
      setTeachers(res.data.data);
      setMeta(res.data.meta || { total: 0, pages: 1 });
    } catch {
      toast.error('Failed to load teachers');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    Promise.all([classService.getAll(), subjectService.getAll()]).then(
      ([c, s]) => {
        setClasses(c.data.data.classes || []);
        setSubjects(s.data.data.subjects || []);
      },
    );
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSelectedSubjects([]);
    setSelected(null);
    setModal('form');
  };
  const openEdit = (t) => {
    setSelected(t);
    setForm({
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      phone: t.phone || '',
      role: 'Teacher',
      teacherProfile: {
        staffId: t.teacherProfile?.staffId || '',
        qualification: t.teacherProfile?.qualification || '',
        specialization: t.teacherProfile?.specialization || '',
        experience: t.teacherProfile?.experience || '',
        designation: t.teacherProfile?.designation || '',
        classTeacherOf: t.teacherProfile?.classTeacherOf?._id || '',
      },
    });
    setSelectedSubjects(
      (t.teacherProfile?.subjectsTaught || []).map((s) => s._id || s),
    );
    setModal('form');
  };

  const setField = (path, val) => {
    const keys = path.split('.');
    if (keys.length === 1) setForm((f) => ({ ...f, [path]: val }));
    else
      setForm((f) => ({ ...f, [keys[0]]: { ...f[keys[0]], [keys[1]]: val } }));
  };

  const toggleSubject = (id) =>
    setSelectedSubjects((p) =>
      p.includes(id) ? p.filter((s) => s !== id) : [...p, id],
    );

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        teacherProfile: {
          ...form.teacherProfile,
          subjectsTaught: selectedSubjects,
        },
      };
      if (!selected) {
        await userService.create(payload);
        toast.success('Teacher created — welcome email sent');
      } else {
        await userService.update(selected._id, payload);
        toast.success('Teacher updated');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      const r = await userService.toggleStatus(id);
      toast.success(r.data.message);
      load();
    } catch {
      toast.error('Failed');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await userService.delete(deleteTarget);
      toast.success('Teacher deleted');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Teachers</h1>
          <p className="page-header__subtitle">{meta.total} staff members</p>
        </div>
        <button className="btn btn--primary" onClick={openCreate}>
          <Plus size={16} /> Add Teacher
        </button>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ position: 'relative', maxWidth: 400 }}>
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
            placeholder="Search by name, email, staff ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="card">
        <div
          className="table-wrapper"
          style={{ border: 'none', borderRadius: 0 }}
        >
          <table className="table">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Staff ID</th>
                <th>Qualification</th>
                <th>Class Teacher</th>
                <th>Subjects</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 48 }}>
                    <div className="spinner" style={{ margin: '0 auto' }} />
                  </td>
                </tr>
              ) : teachers.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: 'center',
                      padding: 48,
                      color: 'var(--clr-text-3)',
                    }}
                  >
                    No teachers found
                  </td>
                </tr>
              ) : (
                teachers.map((t) => (
                  <tr key={t._id}>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: '#e0f2fe',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.875rem',
                            color: '#0369a1',
                            flexShrink: 0,
                            overflow: 'hidden',
                          }}
                        >
                          {t.avatar?.url ? (
                            <img
                              src={t.avatar.url}
                              alt=""
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                              }}
                            />
                          ) : (
                            `${t.firstName[0]}${t.lastName[0]}`
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {t.firstName} {t.lastName}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            {t.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {t.teacherProfile?.staffId || '—'}
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {t.teacherProfile?.qualification || '—'}
                    </td>
                    <td>
                      {t.teacherProfile?.classTeacherOf ? (
                        <span className="badge badge--info">
                          {t.teacherProfile.classTeacherOf.name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--clr-text-3)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div
                        style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
                      >
                        {(t.teacherProfile?.subjectsTaught || [])
                          .slice(0, 2)
                          .map((s) => (
                            <span
                              key={s._id || s}
                              className="badge badge--neutral"
                              style={{ fontSize: '0.7rem' }}
                            >
                              {s.name || '—'}
                            </span>
                          ))}
                        {(t.teacherProfile?.subjectsTaught || []).length >
                          2 && (
                          <span
                            className="badge badge--neutral"
                            style={{ fontSize: '0.7rem' }}
                          >
                            +{t.teacherProfile.subjectsTaught.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge badge--${t.isActive ? 'success' : 'danger'}`}
                      >
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td
                      style={{
                        color: 'var(--clr-text-3)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {format(new Date(t.createdAt), 'dd MMM yyyy')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn--ghost btn--sm btn--icon"
                          onClick={() => openEdit(t)}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn--ghost btn--sm btn--icon"
                          onClick={() => handleToggle(t._id)}
                        >
                          {t.isActive ? (
                            <UserX size={14} />
                          ) : (
                            <UserCheck size={14} />
                          )}
                        </button>
                        <button
                          className="btn btn--ghost btn--sm btn--icon"
                          style={{ color: 'var(--clr-danger)' }}
                          onClick={() => setDeleteTarget(t._id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pages={meta.pages}
          total={meta.total}
          limit={15}
          onChange={setPage}
        />
      </div>

      <Modal
        open={modal === 'form'}
        onClose={() => setModal(null)}
        title={selected ? 'Edit Teacher' : 'Add New Teacher'}
        maxWidth={680}
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
              {saving ? 'Saving...' : 'Save Teacher'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSave}>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
          >
            {[
              ['firstName', 'First Name', 'text'],
              ['lastName', 'Last Name', 'text'],
              ['email', 'Email Address', 'email'],
              ['phone', 'Phone Number', 'tel'],
            ].map(([f, l, t]) => (
              <div className="form-group" key={f} style={{ marginBottom: 0 }}>
                <label>{l}</label>
                <input
                  type={t}
                  className="form-control"
                  required={['firstName', 'lastName', 'email'].includes(f)}
                  value={form[f]}
                  onChange={(e) => setField(f, e.target.value)}
                />
              </div>
            ))}
            {!selected && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Password *</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  placeholder="Min. 8 characters"
                />
              </div>
            )}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Staff ID</label>
              <input
                className="form-control"
                value={form.teacherProfile.staffId}
                readOnly
                placeholder="Auto Generated"
                onChange={(e) =>
                  setField('teacherProfile.staffId', e.target.value)
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Qualification</label>
              <input
                className="form-control"
                value={form.teacherProfile.qualification}
                onChange={(e) =>
                  setField('teacherProfile.qualification', e.target.value)
                }
                placeholder="e.g. B.Ed Mathematics"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Specialization</label>
              <input
                className="form-control"
                value={form.teacherProfile.specialization}
                onChange={(e) =>
                  setField('teacherProfile.specialization', e.target.value)
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Designation</label>
              <input
                className="form-control"
                value={form.teacherProfile.designation}
                onChange={(e) =>
                  setField('teacherProfile.designation', e.target.value)
                }
                placeholder="e.g. HOD, Form Teacher"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Experience (years)</label>
              <input
                type="number"
                min={0}
                className="form-control"
                value={form.teacherProfile.experience}
                onChange={(e) =>
                  setField('teacherProfile.experience', e.target.value)
                }
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Assign as Class Teacher</label>
              <select
                className="form-control"
                value={form.teacherProfile.classTeacherOf}
                onChange={(e) =>
                  setField('teacherProfile.classTeacherOf', e.target.value)
                }
              >
                <option value="">Not a class teacher</option>
                {classes.length > 0 &&
                  classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 500,
                fontSize: '0.875rem',
                color: 'var(--clr-text-2)',
                marginBottom: 10,
              }}
            >
              <BookOpen size={14} /> Subjects Taught (select all that apply)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {subjects &&
                subjects.length > 0 &&
                subjects.map((s) => {
                  const active = selectedSubjects.includes(s._id);
                  return (
                    <button
                      key={s._id}
                      type="button"
                      onClick={() => toggleSubject(s._id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-full)',
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                        fontFamily: 'var(--font-body)',
                        transition: 'all 0.15s',
                        border: `1.5px solid ${active ? 'var(--clr-primary)' : 'var(--clr-border)'}`,
                        background: active
                          ? 'var(--clr-primary)'
                          : 'transparent',
                        color: active ? '#fff' : 'var(--clr-text-2)',
                      }}
                    >
                      {s.name}
                    </button>
                  );
                })}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Teacher"
        message="This will permanently delete the teacher and all their data. This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </>
  );
}
