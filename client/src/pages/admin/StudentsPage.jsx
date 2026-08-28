import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
} from 'lucide-react';
import { userService, classService } from '../../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import useQuickAction from '../../utils/useQuickAction';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  role: 'Student',
  studentProfile: {
    admissionNumber: '',
    gender: '',
    class: '',
    section: '',
    dateOfBirth: '',
    address: '',
    bloodGroup: '',
    medicalNotes: '',
  },
};

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [modal, setModal] = useState(null); // null | 'create' | 'edit'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { role: 'Student', page, limit: 15 };
      if (search) params.search = search;
      if (classFilter) params.class = classFilter;
      const res = await userService.getAll(params);
      setStudents(res.data.data);
      setMeta(res.data.meta || { total: 0, pages: 1 });
    } catch {
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [page, search, classFilter]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    classService.getAll().then((r) => setClasses(r.data.data.classes || []));
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSelected(null);
    setModal('create');
  };
  useQuickAction('student', openCreate);
  const openEdit = (s) => {
    setSelected(s);
    setForm({
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      phone: s.phone || '',
      role: 'Student',
      studentProfile: {
        admissionNumber: s.studentProfile?.admissionNumber || '',
        gender: s.studentProfile?.gender || '',
        class: s.studentProfile?.class?._id || '',
        section: s.studentProfile?.section || '',
        dateOfBirth: s.studentProfile?.dateOfBirth
          ? s.studentProfile.dateOfBirth.split('T')[0]
          : '',
        address: s.studentProfile?.address || '',
        bloodGroup: s.studentProfile?.bloodGroup || '',
        medicalNotes: s.studentProfile?.medicalNotes || '',
      },
    });
    setModal('edit');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'create') {
        await userService.create(form);
        toast.success('Student created and welcome email sent');
      } else {
        await userService.update(selected._id, form);
        toast.success('Student updated');
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
      const res = await userService.toggleStatus(id);
      toast.success(res.data.message);
      load();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async () => {
    try {
      await userService.delete(deleteConfirm);
      toast.success('Student deleted');
      setDeleteConfirm(null);
      load();
    } catch {
      toast.error('Delete failed');
    }
  };

  const setField = (path, val) => {
    const keys = path.split('.');
    if (keys.length === 1) {
      setForm((f) => ({ ...f, [path]: val }));
    } else {
      setForm((f) => ({ ...f, [keys[0]]: { ...f[keys[0]], [keys[1]]: val } }));
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Students</h1>
          <p className="page-header__subtitle">{meta.total} total students</p>
        </div>
        <button className="btn btn--primary" onClick={openCreate}>
          <Plus size={16} /> Add Student
        </button>
      </div>

      {/* Filters */}
      <div
        style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
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
            placeholder="Search by name, email, admission no..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: 160 }}
          value={classFilter}
          onChange={(e) => {
            setClassFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Classes</option>
          {classes &&
            classes.length > 0 &&
            classes?.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
        </select>
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
                <th>Student</th>
                <th>Admission No.</th>
                <th>Class</th>
                <th>Gender</th>
                <th>Bld Grp</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 48 }}>
                    <div className="spinner" style={{ margin: '0 auto' }} />
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: 'center',
                      padding: 48,
                      color: 'var(--clr-text-3)',
                    }}
                  >
                    No students found
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s._id}>
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
                            background: '#dbeafe',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.875rem',
                            color: '#1e40af',
                            flexShrink: 0,
                            overflow: 'hidden',
                          }}
                        >
                          {s.avatar?.url ? (
                            <img
                              src={s.avatar.url}
                              alt=""
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                              }}
                            />
                          ) : (
                            `${s.firstName[0]}${s.lastName[0]}`
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {s.firstName} {s.lastName}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            {s.email}
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
                      {s.studentProfile?.admissionNumber || '—'}
                    </td>
                    <td>{s.studentProfile?.class?.name || '—'}</td>
                    <td>{s.studentProfile?.gender || '—'}</td>
                    <td>{s.studentProfile?.bloodGroup || '—'}</td>
                    <td>
                      <span
                        className={`badge badge--${s.isActive ? 'success' : 'danger'}`}
                      >
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td
                      style={{
                        color: 'var(--clr-text-3)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {format(new Date(s.createdAt), 'dd MMM yyyy')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn--ghost btn--sm btn--icon"
                          onClick={() => openEdit(s)}
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn--ghost btn--sm btn--icon"
                          onClick={() => handleToggle(s._id)}
                          title={s.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {s.isActive ? (
                            <UserX size={14} />
                          ) : (
                            <UserCheck size={14} />
                          )}
                        </button>
                        <button
                          className="btn btn--ghost btn--sm btn--icon"
                          style={{ color: 'var(--clr-danger)' }}
                          onClick={() => setDeleteConfirm(s._id)}
                          title="Delete"
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

        {/* Pagination */}
        {meta.pages > 1 && (
          <div
            className="card__footer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '0.875rem', color: 'var(--clr-text-3)' }}>
              Page {page} of {meta.pages} ({meta.total} records)
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn--secondary btn--sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                className="btn btn--secondary btn--sm"
                disabled={page >= meta.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}
        >
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal__header">
              <h3 className="modal__title">
                {modal === 'create' ? 'Add New Student' : 'Edit Student'}
              </h3>
              <button
                className="btn btn--ghost btn--icon"
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal__body">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 16,
                  }}
                >
                  {[
                    ['firstName', 'First Name', 'text'],
                    ['lastName', 'Last Name', 'text'],
                    ['email', 'Email', 'email'],
                    ['phone', 'Phone', 'tel'],
                  ].map(([field, label, type]) => (
                    <div
                      className="form-group"
                      key={field}
                      style={{ marginBottom: 0 }}
                    >
                      <label>{label}</label>
                      <input
                        type={type}
                        className="form-control"
                        required={['firstName', 'lastName', 'email'].includes(
                          field,
                        )}
                        value={form[field]}
                        onChange={(e) => setField(field, e.target.value)}
                      />
                    </div>
                  ))}
                  {modal === 'create' && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Password</label>
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
                    <label>Admission No.</label>
                    <input
                      type="text"
                      className="form-control"
                      value={form.studentProfile.admissionNumber}
                      readOnly
                      placeholder="Auto Generated"
                      onChange={(e) =>
                        setField(
                          'studentProfile.admissionNumber',
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Class</label>
                    <select
                      className="form-control"
                      value={form.studentProfile?.class || ''}
                      onChange={(e) =>
                        setField('studentProfile.class', e.target.value)
                      }
                    >
                      <option value="">Select class</option>
                      {classes &&
                        classes.length > 0 &&
                        classes.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Gender</label>
                    <select
                      className="form-control"
                      value={form.studentProfile?.gender || ''}
                      onChange={(e) =>
                        setField('studentProfile.gender', e.target.value)
                      }
                    >
                      <option value="">Select gender</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Date of Birth</label>
                    <input
                      type="date"
                      className="form-control"
                      value={form.studentProfile.dateOfBirth}
                      onChange={(e) =>
                        setField('studentProfile.dateOfBirth', e.target.value)
                      }
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Blood Group</label>
                    <select
                      className="form-control"
                      value={form.studentProfile.bloodGroup}
                      onChange={(e) =>
                        setField('studentProfile.bloodGroup', e.target.value)
                      }
                    >
                      <option value="">Select Blood Group</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </select>
                  </div>
                  <div
                    className="form-group"
                    style={{
                      gridColumn: '1/-1',
                      marginBottom: 0,
                    }}
                  >
                    <label>Medical Notes (Optional)</label>
                    <textarea
                      className="form-control"
                      value={form.studentProfile.medicalNotes}
                      onChange={(e) =>
                        setField('studentProfile.medicalNotes', e.target.value)
                      }
                      style={{ resize: 'none' }}
                    />
                  </div>

                  <div
                    className="form-group"
                    style={{ gridColumn: '1/-1', marginBottom: 0 }}
                  >
                    <label>Address</label>
                    <input
                      type="text"
                      className="form-control"
                      value={form.studentProfile?.address || ''}
                      onChange={(e) =>
                        setField('studentProfile.address', e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="modal__footer">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal__header">
              <h3 className="modal__title">Delete Student?</h3>
            </div>
            <div className="modal__body">
              <p>
                This action cannot be undone. All related data will be
                permanently deleted.
              </p>
            </div>
            <div className="modal__footer">
              <button
                className="btn btn--secondary"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button className="btn btn--danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
