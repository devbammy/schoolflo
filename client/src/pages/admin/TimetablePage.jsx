import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Save,
  Globe,
  Calendar,
  Clock,
  BookOpen,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import {
  timetableService,
  classService,
  subjectService,
  userService,
} from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import TimetableView from '../../components/common/TimetableView';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  generateAcademicYearOptions,
  getCurrentAcademicYear,
} from '../../utils/academicYear';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const TERMS = ['First Term', 'Second Term', 'Third Term'];
const BREAKS = ['Assembly', 'Break', 'Lunch', 'Games', 'Free Period'];

// ── Generate time slots in 5-min increments ───────────────────────────────────
function timeslots() {
  const slots = [];
  for (let h = 6; h <= 18; h++) {
    for (let m = 0; m < 60; m += 5) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}
const TIME_OPTIONS = timeslots();

// ── Subject color palette (same hash as TimetableView) ───────────────────────
const PALETTE = [
  '#dbeafe',
  '#d1fae5',
  '#ede9fe',
  '#fce7f3',
  '#fef3c7',
  '#fee2e2',
  '#e0f2fe',
  '#f0fdf4',
  '#fdf4ff',
  '#fff7ed',
];
function subjectBg(id) {
  if (!id) return '#f1f5f9';
  const hash = String(id)
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  return PALETTE[hash % PALETTE.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Period Editor Modal
// ─────────────────────────────────────────────────────────────────────────────
function PeriodModal({
  open,
  onClose,
  onSave,
  period,
  subjects,
  teachers,
  periodNumber,
  day,
}) {
  const [form, setForm] = useState({
    isBreak: false,
    breakLabel: '',
    subject: '',
    teacher: '',
    room: '',
    startTime: '08:00',
    endTime: '08:45',
  });

  useEffect(() => {
    if (!open) return;
    if (period) {
      setForm({
        isBreak: period.isBreak || false,
        breakLabel: period.breakLabel || '',
        subject: period.subject?._id || period.subject || '',
        teacher: period.teacher?._id || period.teacher || '',
        room: period.room || '',
        startTime: period.startTime || '08:00',
        endTime: period.endTime || '08:45',
      });
    } else {
      setForm({
        isBreak: false,
        breakLabel: '',
        subject: '',
        teacher: '',
        room: '',
        startTime: '08:00',
        endTime: '08:45',
      });
    }
  }, [open, period]);

  const f = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${period ? 'Edit' : 'Add'} Period — ${day}, P${periodNumber}`}
      maxWidth={440}
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={() => onSave(form)}>
            Save Period
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Break toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            padding: '10px 12px',
            background: 'var(--clr-bg)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--clr-border)',
          }}
        >
          <input
            type="checkbox"
            checked={form.isBreak}
            onChange={(e) => f('isBreak', e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
              This is a break / free period
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)' }}>
              Assembly, Lunch, Break, etc.
            </div>
          </div>
        </label>

        {form.isBreak ? (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Break Label</label>
            <select
              className="form-control"
              value={form.breakLabel}
              onChange={(e) => f('breakLabel', e.target.value)}
            >
              <option value="">Select or type below</option>
              {BREAKS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
            <input
              className="form-control"
              style={{ marginTop: 6 }}
              placeholder="Or type custom label..."
              value={form.breakLabel}
              onChange={(e) => f('breakLabel', e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Subject</label>
              <select
                className="form-control"
                value={form.subject}
                onChange={(e) => f('subject', e.target.value)}
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
              <label>Teacher</label>
              <select
                className="form-control"
                value={form.teacher}
                onChange={(e) => f('teacher', e.target.value)}
              >
                <option value="">Select teacher (optional)</option>
                {teachers.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.firstName} {t.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Room / Venue</label>
              <input
                className="form-control"
                placeholder="e.g. Lab 1, Room 12B"
                value={form.room}
                onChange={(e) => f('room', e.target.value)}
              />
            </div>
          </>
        )}

        {/* Time */}
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Start Time</label>
            <select
              className="form-control"
              value={form.startTime}
              onChange={(e) => f('startTime', e.target.value)}
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>End Time</label>
            <select
              className="form-control"
              value={form.endTime}
              onChange={(e) => f('endTime', e.target.value)}
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Timetable Grid Editor (for a single timetable)
// ─────────────────────────────────────────────────────────────────────────────
function TimetableEditor({
  timetable,
  subjects,
  teachers,
  onPeriodSave,
  onPeriodDelete,
}) {
  const [editTarget, setEditTarget] = useState(null); // { day, periodNumber, existing }
  const [periodModalOpen, setPeriodModalOpen] = useState(false);

  // Build schedule map
  const schedule = {};
  DAYS.forEach((d) => {
    schedule[d] = {};
  });
  (timetable.periods || []).forEach((p) => {
    if (schedule[p.day]) schedule[p.day][p.periodNumber] = p;
  });

  // Max period number across all days (min 8)
  const maxPeriod = Math.max(
    8,
    ...(timetable.periods || []).map((p) => p.periodNumber),
  );
  const periodNums = Array.from({ length: maxPeriod }, (_, i) => i + 1);

  const openEdit = (day, pNum) => {
    setEditTarget({
      day,
      periodNumber: pNum,
      existing: schedule[day][pNum] || null,
    });
    setPeriodModalOpen(true);
  };

  const handleSave = async (formData) => {
    await onPeriodSave({
      ...formData,
      day: editTarget.day,
      periodNumber: editTarget.periodNumber,
    });
    setPeriodModalOpen(false);
  };

  const handleDelete = async (day, pNum) => {
    if (!window.confirm(`Remove period P${pNum} on ${day}?`)) return;
    await onPeriodDelete(day, pNum);
  };

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            borderCollapse: 'separate',
            borderSpacing: 3,
            minWidth: 680,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  width: 44,
                  fontSize: '0.6875rem',
                  color: 'var(--clr-text-3)',
                  fontWeight: 600,
                  textAlign: 'center',
                  paddingBottom: 8,
                }}
              >
                P#
              </th>
              {DAYS.map((day) => (
                <th
                  key={day}
                  style={{
                    minWidth: 108,
                    textAlign: 'center',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: 'var(--clr-text-2)',
                    paddingBottom: 8,
                  }}
                >
                  {day.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periodNums.map((pNum) => (
              <tr key={pNum}>
                <td
                  style={{
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    color: 'var(--clr-text-3)',
                    verticalAlign: 'middle',
                    paddingRight: 4,
                  }}
                >
                  P{pNum}
                </td>
                {DAYS.map((day) => {
                  const period = schedule[day][pNum];
                  const bg = period
                    ? period.isBreak
                      ? '#f8fafc'
                      : subjectBg(period.subject?._id || period.subject)
                    : 'transparent';

                  return (
                    <td key={day} style={{ verticalAlign: 'top' }}>
                      <div
                        onClick={() => openEdit(day, pNum)}
                        style={{
                          minHeight: 64,
                          borderRadius: 6,
                          background: bg,
                          border: `1.5px solid ${period ? '#cbd5e1' : 'var(--clr-border)'}`,
                          borderStyle: period ? 'solid' : 'dashed',
                          cursor: 'pointer',
                          padding: '5px 6px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          transition: 'opacity 0.15s, border-color 0.15s',
                          position: 'relative',
                        }}
                      >
                        {period ? (
                          <>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                color: '#1e293b',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {period.isBreak
                                ? period.breakLabel || 'Break'
                                : period.subject?.name || '—'}
                            </div>
                            {!period.isBreak && period.teacher && (
                              <div
                                style={{
                                  fontSize: '0.65rem',
                                  color: '#64748b',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {period.teacher.firstName}{' '}
                                {period.teacher.lastName}
                              </div>
                            )}
                            <div
                              style={{ fontSize: '0.65rem', color: '#94a3b8' }}
                            >
                              {period.startTime}–{period.endTime}
                            </div>
                            {/* Delete x button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(day, pNum);
                              }}
                              style={{
                                position: 'absolute',
                                top: 3,
                                right: 3,
                                background: 'rgba(239,68,68,0.12)',
                                border: 'none',
                                borderRadius: 4,
                                width: 18,
                                height: 18,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                              title="Remove period"
                            >
                              <X size={10} color="#ef4444" />
                            </button>
                          </>
                        ) : (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: '100%',
                              minHeight: 50,
                            }}
                          >
                            <span
                              style={{
                                fontSize: '0.7rem',
                                color: 'var(--clr-text-3)',
                              }}
                            >
                              + Add
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PeriodModal
        open={periodModalOpen}
        onClose={() => setPeriodModalOpen(false)}
        onSave={handleSave}
        period={editTarget?.existing}
        day={editTarget?.day}
        periodNumber={editTarget?.periodNumber}
        subjects={subjects}
        teachers={teachers}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TimetablePage() {
  const [timetables, setTimetables] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCls, setFilterCls] = useState('');
  const [filterTerm, setFilterTerm] = useState('');
  const [filterAcademicYear, setFilterAcademicYear] = useState(
    getCurrentAcademicYear(),
  );
  const [expanded, setExpanded] = useState(null);
  const [previewTT, setPreviewTT] = useState(null); // timetable to show in preview modal
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    class: '',
    section: '',
    term: 'First Term',
    academicYear: getCurrentAcademicYear(),
    notes: '',
  });
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const academicYears = generateAcademicYearOptions({
    count: 3,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCls) params.classId = filterCls;
      if (filterTerm) params.term = filterTerm;

      if (filterAcademicYear) {
        params.academicYear = filterAcademicYear;
      }
      const res = await timetableService.getAll(params);
      setTimetables(res.data.data?.timetables || []);
    } catch (err) {
      toast.error('Failed to load timetables');
    } finally {
      setLoading(false);
    }
  }, [filterCls, filterTerm]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([
      classService.getAll(),
      subjectService.getAll(),
      userService.getAll({ role: 'Teacher', limit: 100 }),
    ]).then(([c, s, t]) => {
      setClasses(c.data.data.classes || []);
      setSubjects(s.data.data.subjects || []);
      setTeachers(t.data.data || []);
    });
  }, []);

  // ── Create timetable ───────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.class || !createForm.term)
      return toast.error('Class and term are required');
    setCreating(true);
    try {
      const res = await timetableService.create(createForm);
      toast.success(
        'Timetable created — now add periods by clicking the grid cells',
      );
      setCreateModal(false);
      setExpanded(res.data.data.timetable._id); // auto-expand new timetable
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create timetable');
    } finally {
      setCreating(false);
    }
  };

  // ── Publish / Unpublish ────────────────────────────────────────────────
  const handlePublish = async (id, currently) => {
    try {
      if (currently) {
        await timetableService.unpublish(id);
        toast.success('Timetable unpublished — students can no longer see it');
      } else {
        await timetableService.publish(id);
        toast.success(
          'Timetable published — visible to students, teachers and parents',
        );
      }
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    }
  };

  // ── Upsert period ──────────────────────────────────────────────────────
  const handlePeriodSave = async (timetableId, periodData) => {
    try {
      const res = await timetableService.upsertPeriod(timetableId, periodData);
      // Update local state instead of full reload (faster UX)
      setTimetables((prev) =>
        prev.map((tt) =>
          tt._id === timetableId ? res.data.data.timetable : tt,
        ),
      );
      toast.success('Period saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save period');
    }
  };

  // ── Delete period ──────────────────────────────────────────────────────
  const handlePeriodDelete = async (timetableId, day, periodNumber) => {
    try {
      await timetableService.deletePeriod(timetableId, { day, periodNumber });
      load();
      toast.success('Period removed');
    } catch {
      toast.error('Failed to remove period');
    }
  };

  // ── Delete timetable ───────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await timetableService.delete(deleteTarget);
      toast.success('Timetable deleted');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Timetables</h1>
          <p className="page-header__subtitle">
            Create and manage class timetables
          </p>
        </div>
        <button
          className="btn btn--primary"
          onClick={() => setCreateModal(true)}
        >
          <Plus size={16} /> New Timetable
        </button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div
        style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}
      >
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: 160 }}
          value={filterCls}
          onChange={(e) => setFilterCls(e.target.value)}
        >
          <option value="">All Classes</option>
          {classes.length > 0 &&
            classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
        </select>
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
          value={filterAcademicYear}
          onChange={(e) => setFilterAcademicYear(e.target.value)}
        >
          {academicYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* ── Timetable list ──────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" />
        </div>
      ) : timetables.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '60px 24px' }}>
            <Calendar size={48} className="empty-state__icon" />
            <p className="empty-state__title">No timetables yet</p>
            <p className="empty-state__text">
              Create a timetable for a class to get started. Students, teachers
              and parents will see it on their dashboards once published.
            </p>
            <button
              className="btn btn--primary btn--sm"
              style={{ marginTop: 12 }}
              onClick={() => setCreateModal(true)}
            >
              <Plus size={14} /> Create First Timetable
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {timetables.map((tt) => {
            const isExpanded = expanded === tt._id;
            const periodCount = (tt.periods || []).filter(
              (p) => !p.isBreak,
            ).length;
            const breakCount = (tt.periods || []).filter(
              (p) => p.isBreak,
            ).length;

            return (
              <div key={tt._id} className="card">
                {/* ── Row header ──────────────────────────────────────── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 20px',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Class badge */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 'var(--radius-md)',
                      background: '#dbeafe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: '0.875rem',
                      color: '#1e40af',
                      flexShrink: 0,
                    }}
                  >
                    {tt.class?.name?.slice(0, 3) || '?'}
                  </div>

                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        fontSize: '1rem',
                      }}
                    >
                      {tt.class?.name || 'Unknown Class'}
                      {tt.section && (
                        <span
                          style={{
                            fontWeight: 400,
                            color: 'var(--clr-text-3)',
                            marginLeft: 6,
                          }}
                        >
                          · {tt.section}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        fontSize: '0.8125rem',
                        color: 'var(--clr-text-3)',
                        marginTop: 2,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        {tt.term} · {tt.academicYear}
                      </span>
                      <span>
                        {periodCount} lesson{periodCount !== 1 ? 's' : ''}
                      </span>
                      {breakCount > 0 && (
                        <span>
                          {breakCount} break{breakCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <span
                    className={`badge badge--${tt.isPublished ? 'success' : 'neutral'}`}
                  >
                    {tt.isPublished ? '● Published' : '○ Draft'}
                  </span>

                  {/* Actions */}
                  <div
                    style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                  >
                    <button
                      className="btn btn--ghost btn--sm btn--icon"
                      onClick={() => setPreviewTT(tt)}
                      title="Preview"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      className={`btn btn--sm ${tt.isPublished ? 'btn--secondary' : 'btn--primary'}`}
                      onClick={() => handlePublish(tt._id, tt.isPublished)}
                      style={{ gap: 4 }}
                    >
                      {tt.isPublished ? (
                        <>
                          <EyeOff size={13} /> Unpublish
                        </>
                      ) : (
                        <>
                          <Globe size={13} /> Publish
                        </>
                      )}
                    </button>
                    <button
                      className="btn btn--ghost btn--sm btn--icon"
                      onClick={() => setExpanded(isExpanded ? null : tt._id)}
                      title={isExpanded ? 'Collapse editor' : 'Open editor'}
                    >
                      {isExpanded ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                    <button
                      className="btn btn--ghost btn--sm btn--icon"
                      style={{ color: 'var(--clr-danger)' }}
                      onClick={() => setDeleteTarget(tt._id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* ── Grid Editor (expanded) ───────────────────────────── */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: '1px solid var(--clr-border)',
                      padding: '16px 20px',
                    }}
                  >
                    <div
                      style={{
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          color: 'var(--clr-text-3)',
                        }}
                      >
                        Click any cell to add or edit a period. Click{' '}
                        <strong>×</strong> to remove.
                      </span>
                      {tt.isPublished && (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--clr-warning)',
                            fontWeight: 600,
                            background: '#fef3c7',
                            padding: '2px 8px',
                            borderRadius: 4,
                          }}
                        >
                          ⚠ This timetable is published — changes are live
                          immediately
                        </span>
                      )}
                    </div>
                    <TimetableEditor
                      timetable={tt}
                      subjects={subjects}
                      teachers={teachers}
                      onPeriodSave={(data) => handlePeriodSave(tt._id, data)}
                      onPeriodDelete={(day, pNum) =>
                        handlePeriodDelete(tt._id, day, pNum)
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Timetable Modal ───────────────────────────────────── */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="Create New Timetable"
        maxWidth={500}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setCreateModal(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              disabled={creating}
              onClick={handleCreate}
            >
              {creating ? 'Creating...' : 'Create Timetable'}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreate}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                padding: '10px 14px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                color: '#1e40af',
              }}
            >
              After creating, the grid editor will open automatically. Click any
              cell to assign a subject, teacher, time and room.
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Class *</label>
              <select
                className="form-control"
                required
                value={createForm.class}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, class: e.target.value }))
                }
              >
                <option value="">Select class</option>
                {classes.length > 0 &&
                  classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>
                  Section{' '}
                  <span
                    style={{
                      fontWeight: 400,
                      color: 'var(--clr-text-3)',
                      fontSize: '0.8rem',
                    }}
                  >
                    (optional)
                  </span>
                </label>
                <input
                  className="form-control"
                  placeholder="e.g. A, Gold"
                  value={createForm.section}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, section: e.target.value }))
                  }
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Term *</label>
                <select
                  className="form-control"
                  required
                  value={createForm.term}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, term: e.target.value }))
                  }
                >
                  {TERMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Academic Year *</label>
              <select
                className="form-control"
                required
                value={createForm.academicYear}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    academicYear: e.target.value,
                  }))
                }
              >
                {academicYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>
                Notes{' '}
                <span
                  style={{
                    fontWeight: 400,
                    color: 'var(--clr-text-3)',
                    fontSize: '0.8rem',
                  }}
                >
                  (optional)
                </span>
              </label>
              <input
                className="form-control"
                placeholder="Any notes about this timetable..."
                value={createForm.notes}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Preview Modal ───────────────────────────────────────────── */}
      <Modal
        open={!!previewTT}
        onClose={() => setPreviewTT(null)}
        title={`Preview — ${previewTT?.class?.name} ${previewTT?.term}`}
        maxWidth={780}
        footer={
          <button
            className="btn btn--secondary"
            onClick={() => setPreviewTT(null)}
          >
            Close
          </button>
        }
      >
        {previewTT && (
          <TimetableView
            timetables={[previewTT]}
            title=""
            compact={false}
            defaultView="day"
          />
        )}
      </Modal>

      {/* ── Delete Confirm ───────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Timetable"
        message="This will permanently delete the timetable and all its periods. Students, teachers and parents will no longer see it."
        confirmLabel="Delete Timetable"
        danger
        loading={deleting}
      />
    </>
  );
}
