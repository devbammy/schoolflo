import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, Search, BookOpen } from 'lucide-react';
import { subjectService, classService, userService } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';

const EMPTY_FORM = {
  name: '',
  code: '',
  description: '',
  isCore: true,
  creditUnit: 1,
};

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [assignedClasses, setAssignedClasses] = useState([]);
  const [assignedTeachers, setAssignedTeachers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await subjectService.getAll();
      setSubjects(res.data.data.subjects || []);
    } catch {
      toast.error('Failed to load subjects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    Promise.all([
      classService.getAll(),
      userService.getAll({ role: 'Teacher', limit: 100 }),
    ]).then(([c, t]) => {
      setClasses(c.data.data || []);
      setTeachers(t.data.data || []);
    });
  }, []);

  const filtered = subjects.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()),
  );

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setAssignedClasses([]);
    setAssignedTeachers([]);
    setSelected(null);
    setModal('form');
  };
  const openEdit = (s) => {
    setSelected(s);
    setForm({
      name: s.name,
      code: s.code,
      description: s.description || '',
      isCore: s.isCore,
      creditUnit: s.creditUnit,
    });
    setAssignedClasses((s.classes || []).map((c) => c._id || c));
    setAssignedTeachers((s.teachers || []).map((t) => t._id || t));
    setModal('form');
  };

  const toggle = (list, setList, id) =>
    setList((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        code: form.code.toUpperCase(),
        classes: assignedClasses,
        teachers: assignedTeachers,
      };
      if (!selected) {
        await subjectService.create(payload);
        toast.success('Subject created');
      } else {
        await subjectService.update(selected._id, payload);
        toast.success('Subject updated');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await subjectService.update(deleteTarget, { isActive: false });
      toast.success('Subject deactivated');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Subjects</h1>
          <p className="page-header__subtitle">
            {subjects.length} subjects configured
          </p>
        </div>
        <button className="btn btn--primary" onClick={openCreate}>
          <Plus size={16} /> Add Subject
        </button>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ position: 'relative', maxWidth: 360 }}>
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
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
                <th>Subject</th>
                <th>Code</th>
                <th>Type</th>
                <th>Credit</th>
                <th>Classes</th>
                <th>Teachers</th>
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
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: 'center',
                      padding: 48,
                      color: 'var(--clr-text-3)',
                    }}
                  >
                    No subjects found
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
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
                            width: 34,
                            height: 34,
                            borderRadius: 'var(--radius-sm)',
                            background: '#ede9fe',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <BookOpen size={16} color="#7c3aed" />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{s.name}</div>
                          {s.description && (
                            <div
                              style={{
                                fontSize: '0.8125rem',
                                color: 'var(--clr-text-3)',
                              }}
                            >
                              {s.description.slice(0, 50)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {s.code}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge--${s.isCore ? 'info' : 'neutral'}`}
                      >
                        {s.isCore ? 'Core' : 'Elective'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{s.creditUnit}</td>
                    <td>
                      <div
                        style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
                      >
                        {(s.classes || []).slice(0, 3).map((c) => (
                          <span
                            key={c._id}
                            className="badge badge--neutral"
                            style={{ fontSize: '0.7rem' }}
                          >
                            {c.name}
                          </span>
                        ))}
                        {(s.classes || []).length > 3 && (
                          <span
                            className="badge badge--neutral"
                            style={{ fontSize: '0.7rem' }}
                          >
                            +{s.classes.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div
                        style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
                      >
                        {(s.teachers || []).slice(0, 2).map((t) => (
                          <span
                            key={t._id}
                            className="badge badge--purple"
                            style={{ fontSize: '0.7rem' }}
                          >
                            {t.firstName} {t.lastName?.[0]}.
                          </span>
                        ))}
                        {(s.teachers || []).length > 2 && (
                          <span
                            className="badge badge--neutral"
                            style={{ fontSize: '0.7rem' }}
                          >
                            +{s.teachers.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn--ghost btn--sm btn--icon"
                          onClick={() => openEdit(s)}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn--ghost btn--sm btn--icon"
                          style={{ color: 'var(--clr-danger)' }}
                          onClick={() => setDeleteTarget(s._id)}
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
      </div>

      <Modal
        open={modal === 'form'}
        onClose={() => setModal(null)}
        title={selected ? 'Edit Subject' : 'Add New Subject'}
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
              {saving ? 'Saving...' : 'Save Subject'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSave}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Subject Name *</label>
              <input
                className="form-control"
                required
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Mathematics"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Subject Code *</label>
              <input
                className="form-control"
                required
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
                placeholder="e.g. MTH101"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Type</label>
              <select
                className="form-control"
                value={form.isCore}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isCore: e.target.value === 'true' }))
                }
              >
                <option value="true">Core Subject</option>
                <option value="false">Elective Subject</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Credit Units</label>
              <input
                type="number"
                min={1}
                max={6}
                className="form-control"
                value={form.creditUnit}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    creditUnit: parseInt(e.target.value),
                  }))
                }
              />
            </div>
            <div
              className="form-group"
              style={{ gridColumn: '1/-1', marginBottom: 0 }}
            >
              <label>Description</label>
              <input
                className="form-control"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Optional description"
              />
            </div>
          </div>

          {/* Classes */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontWeight: 600,
                fontSize: '0.875rem',
                display: 'block',
                marginBottom: 8,
              }}
            >
              Assign to Classes
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {classes.length > 0 &&
                classes.map((c) => {
                  const active = assignedClasses.includes(c._id);
                  return (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() =>
                        toggle(assignedClasses, setAssignedClasses, c._id)
                      }
                      style={{
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-full)',
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                        fontFamily: 'var(--font-body)',
                        transition: 'all 0.15s',
                        border: `1.5px solid ${active ? '#1A4FAB' : 'var(--clr-border)'}`,
                        background: active ? '#1A4FAB' : 'transparent',
                        color: active ? '#fff' : 'var(--clr-text-2)',
                      }}
                    >
                      {c.name}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Teachers */}
          <div>
            <label
              style={{
                fontWeight: 600,
                fontSize: '0.875rem',
                display: 'block',
                marginBottom: 8,
              }}
            >
              Assign Teachers
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {teachers.map((t) => {
                const active = assignedTeachers.includes(t._id);
                return (
                  <button
                    key={t._id}
                    type="button"
                    onClick={() =>
                      toggle(assignedTeachers, setAssignedTeachers, t._id)
                    }
                    style={{
                      padding: '5px 12px',
                      borderRadius: 'var(--radius-full)',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      fontFamily: 'var(--font-body)',
                      transition: 'all 0.15s',
                      border: `1.5px solid ${active ? '#7C3AED' : 'var(--clr-border)'}`,
                      background: active ? '#7C3AED' : 'transparent',
                      color: active ? '#fff' : 'var(--clr-text-2)',
                    }}
                  >
                    {t.firstName} {t.lastName}
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
        title="Deactivate Subject"
        message="This subject will be deactivated and hidden from class assignments."
        confirmLabel="Deactivate"
        danger
        loading={deleting}
      />
    </>
  );
}
