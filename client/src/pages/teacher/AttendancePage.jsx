import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Save,
  AlertCircle,
  Users,
} from 'lucide-react';
import {
  attendanceService,
  classService,
  userService,
} from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const STATUSES = ['Present', 'Absent', 'Late', 'Excused'];
const STATUS_COLORS = {
  Present: '#10B981',
  Absent: '#EF4444',
  Late: '#F59E0B',
  Excused: '#6B7280',
};
const STATUS_ICONS = {
  Present: CheckCircle,
  Absent: XCircle,
  Late: Clock,
  Excused: AlertCircle,
};

/**
 * Safely extract an array from the two shapes the API can return:
 *  - sendSuccess  → { data: { [key]: [...] } }
 *  - sendPaginated → { data: [...] }
 */
function extractArray(response, key) {
  const data = response?.data?.data;
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data[key])) return data[key];
  return [];
}

export default function AttendancePage() {
  const { user } = useAuthStore();

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState({});
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [term] = useState('First Term');
  const [academicYear] = useState('2024/2025');

  // ── 1. Load classes once on mount ─────────────────────────────────────
  useEffect(() => {
    setLoadingClasses(true);
    classService
      .getAll()
      .then((r) => {
        const list = extractArray(r, 'classes');
        setClasses(list);

        // Auto-select the teacher's own class if it is set
        const myClass = user?.teacherProfile?.classTeacherOf;
        if (myClass) {
          const id = typeof myClass === 'object' ? myClass._id : myClass;
          setSelectedClass(id);
        }
      })
      .catch(() => toast.error('Failed to load classes'))
      .finally(() => setLoadingClasses(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Load students + existing records when class or date changes ─────
  useEffect(() => {
    if (!selectedClass) {
      setStudents([]);
      setRecords({});
      return;
    }

    setLoadingStudents(true);
    setStudents([]);
    setRecords({});

    Promise.all([
      userService.getByClass(selectedClass),
      attendanceService.getClassAttendance(selectedClass, { date }),
    ])
      .then(([studRes, attRes]) => {
        // ── Extract students ─────────────────────────────────────────
        // Backend returns { data: { students: [...] } } via sendSuccess
        const studs = extractArray(studRes, 'students');

        // ── Extract any existing attendance for this date ────────────
        // Backend returns { data: { records: [...] } } via sendSuccess
        const existing = {};
        extractArray(attRes, 'records').forEach((r) => {
          const sid = r.student?._id || r.student;
          if (sid) existing[sid] = r.status;
        });

        // Build record map: use saved status or default to Present
        const defaultRecords = {};
        studs.forEach((s) => {
          defaultRecords[s._id] = existing[s._id] || 'Present';
        });

        setStudents(studs);
        setRecords(defaultRecords);

        if (studs.length === 0) {
          toast(
            'No students found in this class. Make sure students have this class assigned in their profile.',
            {
              icon: 'ℹ️',
              duration: 5000,
            },
          );
        }
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || 'Failed to load students');
        setStudents([]);
        setRecords({});
      })
      .finally(() => setLoadingStudents(false));
  }, [selectedClass, date]);

  // ── 3. Bulk-set all students to one status ────────────────────────────
  const setAllStatus = useCallback(
    (status) => {
      setRecords(() => {
        const updated = {};
        students.forEach((s) => {
          updated[s._id] = status;
        });
        return updated;
      });
    },
    [students],
  );

  // ── 4. Save attendance ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedClass) return toast.error('Select a class first');
    if (!students.length)
      return toast.error('No students to save attendance for');

    setSaving(true);
    try {
      await attendanceService.mark({
        classId: selectedClass,
        date,
        term,
        academicYear,
        records: students.map((s) => ({
          student: s._id,
          status: records[s._id] || 'Present',
        })),
      });
      toast.success(
        `Attendance saved for ${students.length} student${students.length !== 1 ? 's' : ''}`,
      );
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const summary = STATUSES.reduce(
    (acc, s) => ({
      ...acc,
      [s]: Object.values(records).filter((v) => v === s).length,
    }),
    {},
  );
  const selectedClassName =
    classes.find((c) => c._id === selectedClass)?.name || '';

  // ─────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Mark Attendance</h1>
          <p className="page-header__subtitle">
            Record daily student attendance
          </p>
        </div>
        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={saving || !students.length}
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Attendance'}
        </button>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div
          className="card__body"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto',
            gap: 16,
            alignItems: 'end',
          }}
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Select Class</label>
            {loadingClasses ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 42,
                }}
              >
                <div
                  className="spinner"
                  style={{ width: 18, height: 18, borderWidth: 2 }}
                />
                <span
                  style={{ fontSize: '0.875rem', color: 'var(--clr-text-3)' }}
                >
                  Loading classes...
                </span>
              </div>
            ) : (
              <select
                className="form-control"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                <option value="">Choose class...</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input
              type="date"
              className="form-control"
              value={date}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => setAllStatus('Present')}
              disabled={!students.length}
            >
              All Present
            </button>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => setAllStatus('Absent')}
              disabled={!students.length}
            >
              All Absent
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary bar ───────────────────────────────────────────────── */}
      {students.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 24,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {STATUSES.map((s) => (
            <div
              key={s}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--clr-surface)',
                border: '1px solid var(--clr-border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 16px',
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: STATUS_COLORS[s],
                }}
              />
              <span
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--clr-text-2)',
                }}
              >
                {s}
              </span>
              <span
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: STATUS_COLORS[s],
                }}
              >
                {summary[s]}
              </span>
            </div>
          ))}
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.875rem',
              color: 'var(--clr-text-3)',
            }}
          >
            {selectedClassName && `${selectedClassName} · `}
            {format(new Date(`${date}T12:00:00`), 'EEEE, dd MMMM yyyy')}
          </span>
        </div>
      )}

      {/* ── Student list ──────────────────────────────────────────────── */}
      <div className="card">
        {/* Loading */}
        {loadingStudents ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 64,
              gap: 16,
            }}
          >
            <div className="spinner" />
            <span style={{ fontSize: '0.9375rem', color: 'var(--clr-text-3)' }}>
              Loading students...
            </span>
          </div>
        ) : /* No class selected */
        !selectedClass ? (
          <div className="empty-state" style={{ padding: '56px 24px' }}>
            <Users size={44} className="empty-state__icon" />
            <p className="empty-state__title">No Class Selected</p>
            <p className="empty-state__text">
              Select a class above to load its students
            </p>
          </div>
        ) : /* Class selected but no students returned */
        students.length === 0 ? (
          <div className="empty-state" style={{ padding: '56px 24px' }}>
            <Users size={44} className="empty-state__icon" />
            <p className="empty-state__title">No Students Found</p>
            <p className="empty-state__text">
              No students are assigned to <strong>{selectedClassName}</strong>{' '}
              yet. Open <strong>Students</strong> and make sure each student has
              this class set in their profile.
            </p>
          </div>
        ) : (
          /* Students loaded */
          <div>
            {students.map((student, idx) => {
              const status = records[student._id] || 'Present';
              const initials = `${student.firstName?.[0] || '?'}${student.lastName?.[0] || ''}`;

              return (
                <div
                  key={student._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '12px 20px',
                    borderBottom:
                      idx < students.length - 1
                        ? '1px solid var(--clr-border)'
                        : 'none',
                    background: status === 'Absent' ? '#fff8f8' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Row number */}
                  <span
                    style={{
                      width: 24,
                      color: 'var(--clr-text-3)',
                      fontSize: '0.8125rem',
                      textAlign: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </span>

                  {/* Avatar */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: '#dbeafe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      color: '#1e40af',
                      fontSize: '0.875rem',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}
                  >
                    {student.avatar?.url ? (
                      <img
                        src={student.avatar.url}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      initials
                    )}
                  </div>

                  {/* Name + admission */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '0.9375rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {student.firstName} {student.lastName}
                    </div>
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--clr-text-3)',
                      }}
                    >
                      {student.studentProfile?.admissionNumber ||
                        'No admission no.'}
                    </div>
                  </div>

                  {/* Status buttons */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      flexShrink: 0,
                    }}
                  >
                    {STATUSES.map((s) => {
                      const Icon = STATUS_ICONS[s];
                      const active = status === s;
                      return (
                        <button
                          key={s}
                          onClick={() =>
                            setRecords((r) => ({ ...r, [student._id]: s }))
                          }
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '5px 12px',
                            borderRadius: 'var(--radius-full)',
                            border: `1.5px solid ${active ? STATUS_COLORS[s] : 'var(--clr-border)'}`,
                            background: active
                              ? `${STATUS_COLORS[s]}18`
                              : 'transparent',
                            color: active
                              ? STATUS_COLORS[s]
                              : 'var(--clr-text-3)',
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.8125rem',
                            fontWeight: active ? 600 : 400,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          <Icon size={12} />
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 20px',
                borderTop: '2px solid var(--clr-border)',
                background: 'var(--clr-bg)',
              }}
            >
              <span
                style={{ fontSize: '0.875rem', color: 'var(--clr-text-3)' }}
              >
                {students.length} student{students.length !== 1 ? 's' : ''}
                {' · '}
                <span style={{ color: STATUS_COLORS.Present, fontWeight: 600 }}>
                  {summary.Present} present
                </span>
                {summary.Absent > 0 && (
                  <span
                    style={{ color: STATUS_COLORS.Absent, fontWeight: 600 }}
                  >
                    , {summary.Absent} absent
                  </span>
                )}
              </span>
              <button
                className="btn btn--primary btn--sm"
                onClick={handleSave}
                disabled={saving}
              >
                <Save size={14} />
                {saving ? 'Saving...' : 'Save Attendance'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
