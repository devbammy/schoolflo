import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Users,
  ChevronDown,
  ChevronUp,
  GraduationCap,
} from 'lucide-react';
import { classService, subjectService, userService } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import {
  generateAcademicYearOptions,
  getCurrentAcademicYear,
} from '../../utils/academicYear';

const LEVELS = ['JSS', 'SS', 'Primary', 'College'];
const EMPTY_FORM = {
  name: '',
  level: 'JSS',
  academicYear: getCurrentAcademicYear(),
  sections: [{ name: 'A', capacity: 40, classTeacher: '' }],
};

const academicYears = generateAcademicYearOptions({
  count: 3,
});

export default function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await classService.getAll();
      setClasses(res.data.data.classes || []);
    } catch {
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    Promise.all([
      userService.getAll({ role: 'Teacher', limit: 100 }),
      subjectService.getAll(),
    ]).then(([t, s]) => {
      setTeachers(t.data.data || []);
      setSubjects(s.data.data.subjects || []);
    });
  }, []);

  const filtered =
    classes.length > 0 &&
    classes.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSelectedSubjects([]);
    setSelected(null);
    setModal('form');
  };

  const openEdit = (cls) => {
    setSelected(cls);
    setForm({
      name: cls.name,
      level: cls.level,
      academicYear: cls.academicYear,
      sections: cls.sections?.length
        ? cls.sections.map((s) => ({
            name: s.name,
            capacity: s.capacity,
            classTeacher: s.classTeacher?._id || '',
          }))
        : [{ name: 'A', capacity: 40, classTeacher: '' }],
    });
    setSelectedSubjects((cls.subjects || []).map((s) => s._id || s));
    setModal('form');
  };

  const addSection = () =>
    setForm((f) => ({
      ...f,
      sections: [...f.sections, { name: '', capacity: 40, classTeacher: '' }],
    }));
  const removeSection = (i) =>
    setForm((f) => ({
      ...f,
      sections: f.sections.filter((_, idx) => idx !== i),
    }));
  const setSection = (i, key, val) =>
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s, idx) =>
        idx === i ? { ...s, [key]: val } : s,
      ),
    }));

  const toggleSubject = (id) =>
    setSelectedSubjects((p) =>
      p.includes(id) ? p.filter((s) => s !== id) : [...p, id],
    );

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Class name is required');
    if (!form.sections.length)
      return toast.error('At least one section required');
    setSaving(true);
    try {
      const payload = { ...form, subjects: selectedSubjects };
      if (!selected) {
        await classService.create(payload);
        toast.success('Class created successfully');
      } else {
        await classService.update(selected._id, payload);
        toast.success('Class updated');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await classService.delete(deleteTarget);
      toast.success('Class deactivated');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Failed');
    } finally {
      setDeleting(false);
    }
  };

  const LEVEL_COLORS = { JSS: '#1A4FAB', SS: '#7C3AED', Primary: '#059669' };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Classes</h1>
          <p className="page-header__subtitle">
            {classes.length} classes configured
          </p>
        </div>
        <button className="btn btn--primary" onClick={openCreate}>
          <Plus size={16} /> New Class
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
            placeholder="Search classes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <GraduationCap size={48} className="empty-state__icon" />
            <p className="empty-state__title">No classes yet</p>
            <p className="empty-state__text">
              Create your first class to get started
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered &&
            filtered.length > 0 &&
            filtered.map((cls) => (
              <div key={cls._id} className="card">
                {/* Class Header Row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '16px 20px',
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 'var(--radius-md)',
                      background: `${LEVEL_COLORS[cls.level]}18`,
                      color: LEVEL_COLORS[cls.level],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: '1rem',
                      flexShrink: 0,
                    }}
                  >
                    {cls.name.slice(0, 3)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          fontSize: '1.0625rem',
                        }}
                      >
                        {cls.name}
                      </span>
                      <span
                        className="badge"
                        style={{
                          background: `${LEVEL_COLORS[cls.level]}20`,
                          color: LEVEL_COLORS[cls.level],
                        }}
                      >
                        {cls.level}
                      </span>
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          color: 'var(--clr-text-3)',
                        }}
                      >
                        {cls.academicYear}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 16,
                        marginTop: 4,
                        fontSize: '0.8125rem',
                        color: 'var(--clr-text-3)',
                      }}
                    >
                      <span>
                        <strong style={{ color: 'var(--clr-text-2)' }}>
                          {cls.sections?.length || 0}
                        </strong>{' '}
                        sections
                      </span>
                      <span>
                        <strong style={{ color: 'var(--clr-text-2)' }}>
                          {(cls.subjects || []).length}
                        </strong>{' '}
                        subjects
                      </span>
                    </div>
                  </div>
                  <div
                    style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                  >
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() =>
                        setExpanded(expanded === cls._id ? null : cls._id)
                      }
                    >
                      {expanded === cls._id ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                      Details
                    </button>
                    <button
                      className="btn btn--ghost btn--sm btn--icon"
                      onClick={() => openEdit(cls)}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="btn btn--ghost btn--sm btn--icon"
                      style={{ color: 'var(--clr-danger)' }}
                      onClick={() => setDeleteTarget(cls._id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Expanded Detail */}
                {expanded === cls._id && (
                  <div
                    style={{
                      borderTop: '1px solid var(--clr-border)',
                      padding: '16px 20px',
                      background: 'var(--clr-bg)',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 20,
                      }}
                    >
                      {/* Sections */}
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            color: 'var(--clr-text-2)',
                            marginBottom: 10,
                          }}
                        >
                          Sections
                        </div>
                        {(cls.sections || []).map((sec, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 12px',
                              background: 'var(--clr-surface)',
                              borderRadius: 'var(--radius-sm)',
                              marginBottom: 6,
                              border: '1px solid var(--clr-border)',
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 600 }}>
                                {cls.name} {sec.name}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.8125rem',
                                  color: 'var(--clr-text-3)',
                                  marginLeft: 8,
                                }}
                              >
                                Cap: {sec.capacity}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: '0.8125rem',
                                color: 'var(--clr-text-3)',
                              }}
                            >
                              {sec.classTeacher
                                ? `Teacher: ${sec.classTeacher.firstName || '—'} ${sec.classTeacher.lastName || ''}`
                                : 'No class teacher'}
                            </span>
                          </div>
                        ))}
                      </div>
                      {/* Subjects */}
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            color: 'var(--clr-text-2)',
                            marginBottom: 10,
                          }}
                        >
                          Subjects ({(cls.subjects || []).length})
                        </div>
                        <div
                          style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
                        >
                          {(cls.subjects || []).map((s) => (
                            <span
                              key={s._id}
                              className="badge badge--info"
                              style={{ fontSize: '0.75rem' }}
                            >
                              {s.name}
                            </span>
                          ))}
                          {(cls.subjects || []).length === 0 && (
                            <span
                              style={{
                                color: 'var(--clr-text-3)',
                                fontSize: '0.875rem',
                              }}
                            >
                              No subjects assigned
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modal === 'form'}
        onClose={() => setModal(null)}
        title={selected ? `Edit Class: ${selected.name}` : 'Create New Class'}
        maxWidth={700}
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
              {saving ? 'Saving...' : 'Save Class'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSave}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Class Name *</label>
              <input
                className="form-control"
                required
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. JSS1, SS2A"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Level *</label>
              <select
                className="form-control"
                value={form.level}
                onChange={(e) =>
                  setForm((f) => ({ ...f, level: e.target.value }))
                }
              >
                {LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Academic Year *</label>

              <select
                className="form-control"
                required
                value={form.academicYear}
                onChange={(e) =>
                  setForm((f) => ({ ...f, academicYear: e.target.value }))
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

          {/* Sections */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <label
                style={{
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  color: 'var(--clr-text-1)',
                  margin: 0,
                }}
              >
                Sections
              </label>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={addSection}
              >
                <Plus size={13} /> Add Section
              </button>
            </div>
            {form.sections.map((sec, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 100px 1fr auto',
                  gap: 10,
                  marginBottom: 8,
                  padding: 12,
                  background: 'var(--clr-bg)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--clr-border)',
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--clr-text-3)',
                      display: 'block',
                      marginBottom: 4,
                    }}
                  >
                    Name
                  </label>
                  <input
                    className="form-control"
                    value={sec.name}
                    onChange={(e) => setSection(i, 'name', e.target.value)}
                    placeholder="A"
                    style={{ padding: '6px 10px' }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--clr-text-3)',
                      display: 'block',
                      marginBottom: 4,
                    }}
                  >
                    Capacity
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    value={sec.capacity}
                    onChange={(e) => setSection(i, 'capacity', e.target.value)}
                    min={1}
                    style={{ padding: '6px 10px' }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--clr-text-3)',
                      display: 'block',
                      marginBottom: 4,
                    }}
                  >
                    Class Teacher
                  </label>
                  <select
                    className="form-control"
                    value={sec.classTeacher}
                    onChange={(e) =>
                      setSection(i, 'classTeacher', e.target.value)
                    }
                    style={{ padding: '6px 10px' }}
                  >
                    <option value="">None</option>
                    {teachers.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.firstName} {t.lastName}
                      </option>
                    ))}
                  </select>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    paddingBottom: 2,
                  }}
                >
                  {form.sections.length > 1 && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm btn--icon"
                      style={{ color: 'var(--clr-danger)' }}
                      onClick={() => removeSection(i)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Subjects */}
          <div>
            <label
              style={{
                fontWeight: 600,
                fontSize: '0.9rem',
                color: 'var(--clr-text-1)',
                display: 'block',
                marginBottom: 10,
              }}
            >
              Assign Subjects
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {subjects &&
                subjects.length > 0 &&
                subjects?.map((s) => {
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
                      {s.name}{' '}
                      <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>
                        ({s.code})
                      </span>
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
        title="Deactivate Class"
        message="This will deactivate the class. Students will remain in the system but won't be attached to an active class."
        confirmLabel="Deactivate"
        danger
        loading={deleting}
      />
    </>
  );
}
