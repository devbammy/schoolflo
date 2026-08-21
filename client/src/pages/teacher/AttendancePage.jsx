import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  Clock,
  Save,
  AlertCircle,
  Users,
  CalendarRange,
  ClipboardCheck,
} from 'lucide-react';
import { attendanceService } from '../../services/api';
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
 *  - sendSuccess   → { data: { [key]: [...] } }
 *  - sendPaginated → { data: [...] }
 */
function extractArray(response, key) {
  const data = response?.data?.data;
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data[key])) return data[key];
  return [];
}

const todayIso = () => format(new Date(), 'yyyy-MM-dd');

export default function AttendancePage() {
  const [searchParams] = useSearchParams();

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(todayIso);

  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState({});
  // What the server holds for this day, kept apart from the working copy so
  // "already marked" stays true even after the teacher edits a row.
  const [saved, setSaved] = useState({ isMarked: false, markedBy: null });
  // The term and session the register will be filed under, decided by the
  // school calendar rather than by this page. It used to be hard-coded here,
  // which filed every register under First Term 2024/2025 forever.
  const [period, setPeriod] = useState(null);

  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);

  const [view, setView] = useState('register'); // 'register' | 'report'
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // ── 1. Load the classes this teacher may mark ─────────────────────────
  useEffect(() => {
    setLoadingClasses(true);

    attendanceService
      .getMyClasses()
      .then((res) => {
        const list = extractArray(res, 'classes');
        setClasses(list);

        // A search result can deep-link to a class; otherwise open the first
        // one, which for most teachers is their only one.
        const requested = searchParams.get('class');
        const preferred =
          list.find((c) => c._id === requested)?._id || list[0]?._id || '';

        setSelectedClass(preferred);

        if (!list.length) {
          toast(
            'You are not assigned to a class yet. Ask an admin to set you as a class or section teacher.',
            { icon: 'ℹ️', duration: 6000 },
          );
        }
      })
      .catch((err) =>
        toast.error(err.response?.data?.message || 'Failed to load classes'),
      )
      .finally(() => setLoadingClasses(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Load the register whenever class or date changes ────────────────
  useEffect(() => {
    if (!selectedClass) {
      setStudents([]);
      setRecords({});
      return;
    }

    setLoadingStudents(true);
    setStudents([]);
    setRecords({});

    attendanceService
      .getClassRegister(selectedClass, { date })
      .then((res) => {
        const payload = res.data?.data || {};
        const roll = payload.students || [];

        // Start from what was actually saved; only an unmarked student
        // defaults to Present.
        const existing = {};
        (payload.records || []).forEach((record) => {
          const id = record.student?._id || record.student;
          if (id) existing[id] = record.status;
        });

        const working = {};
        roll.forEach((student) => {
          working[student._id] = existing[student._id] || 'Present';
        });

        setStudents(roll);
        setRecords(working);
        setPeriod(payload.period || null);
        setSaved({
          isMarked: Boolean(payload.isMarked),
          markedBy: payload.records?.[0]?.markedBy || null,
        });

        if (roll.length === 0) {
          toast(
            'No students in this class yet. Check that students have this class set on their profile.',
            { icon: 'ℹ️', duration: 5000 },
          );
        }
      })
      .catch((err) => {
        toast.error(
          err.response?.data?.message || 'Failed to load the register',
        );
        setStudents([]);
        setRecords({});
      })
      .finally(() => setLoadingStudents(false));
  }, [selectedClass, date]);

  // ── 3. The 30-day report, loaded only when that tab is opened ──────────
  useEffect(() => {
    if (view !== 'report' || !selectedClass) return;

    setLoadingReport(true);
    attendanceService
      .getClassReport(selectedClass, {})
      .then((res) => setReport(res.data?.data || null))
      .catch((err) =>
        toast.error(err.response?.data?.message || 'Failed to load the report'),
      )
      .finally(() => setLoadingReport(false));
  }, [view, selectedClass]);

  const setAllStatus = useCallback(
    (status) => {
      setRecords(() =>
        students.reduce((acc, s) => ({ ...acc, [s._id]: status }), {}),
      );
    },
    [students],
  );

  const handleSave = async () => {
    if (!selectedClass) return toast.error('Select a class first');
    if (!students.length)
      return toast.error('No students to save attendance for');

    setSaving(true);
    try {
      // No term or academic year is sent: the server stamps them from the
      // active academic calendar, which is the only thing that knows.
      const { data } = await attendanceService.mark({
        classId: selectedClass,
        date,
        records: students.map((s) => ({
          student: s._id,
          status: records[s._id] || 'Present',
        })),
      });

      const stamped = data?.data;
      toast.success(
        `Attendance saved for ${students.length} student${
          students.length !== 1 ? 's' : ''
        }${stamped?.term ? ` · ${stamped.term}` : ''}`,
      );

      setSaved((s) => ({ ...s, isMarked: true }));
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

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Attendance</h1>
          <p className="page-header__subtitle">
            Record the daily register for your class
            {period && ` · ${period.term}, ${period.academicYear}`}
          </p>
        </div>
        {view === 'register' && (
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={saving || !students.length}
          >
            <Save size={16} />
            {saving
              ? 'Saving...'
              : saved.isMarked
                ? 'Update Register'
                : 'Save Attendance'}
          </button>
        )}
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
            <label>Class</label>
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
                {!classes.length && (
                  <option value="">No classes assigned</option>
                )}
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
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              disabled={view === 'report'}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className={`btn btn--sm ${view === 'register' ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setView('register')}
            >
              <ClipboardCheck size={14} />
              Register
            </button>
            <button
              className={`btn btn--sm ${view === 'report' ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setView('report')}
              disabled={!selectedClass}
            >
              <CalendarRange size={14} />
              Last 30 days
            </button>
          </div>
        </div>
      </div>

      {view === 'report' ? (
        /* ── Report ──────────────────────────────────────────────────── */
        <div className="card">
          {loadingReport ? (
            <div
              style={{ display: 'flex', justifyContent: 'center', padding: 64 }}
            >
              <div className="spinner" />
            </div>
          ) : !report?.report?.length ? (
            <div className="empty-state" style={{ padding: '56px 24px' }}>
              <CalendarRange size={44} className="empty-state__icon" />
              <p className="empty-state__title">Nothing to report</p>
              <p className="empty-state__text">
                No attendance has been recorded for this class in the last 30
                days.
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--clr-border)',
                  fontSize: '0.875rem',
                  color: 'var(--clr-text-3)',
                }}
              >
                {selectedClassName} · {report.daysMarked} day
                {report.daysMarked !== 1 ? 's' : ''} marked between{' '}
                {format(new Date(report.from), 'dd MMM')} and{' '}
                {format(new Date(report.to), 'dd MMM yyyy')}
              </div>

              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Present</th>
                      <th>Absent</th>
                      <th>Late</th>
                      <th>Excused</th>
                      <th>Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.report.map((row) => (
                      <tr key={row.student._id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {row.student.firstName} {row.student.lastName}
                          </div>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              color: 'var(--clr-text-3)',
                            }}
                          >
                            {row.student.admissionNumber || 'No admission no.'}
                          </div>
                        </td>
                        <td>{row.Present}</td>
                        <td>{row.Absent}</td>
                        <td>{row.Late}</td>
                        <td>{row.Excused}</td>
                        <td>
                          <span
                            style={{
                              fontWeight: 700,
                              color:
                                row.total === 0
                                  ? 'var(--clr-text-3)'
                                  : row.percentage >= 75
                                    ? STATUS_COLORS.Present
                                    : STATUS_COLORS.Absent,
                            }}
                          >
                            {row.total === 0
                              ? 'Never marked'
                              : `${row.percentage}%`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {/* ── Summary bar ───────────────────────────────────────────── */}
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

              <div
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => setAllStatus('Present')}
                >
                  All Present
                </button>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => setAllStatus('Absent')}
                >
                  All Absent
                </button>
              </div>
            </div>
          )}

          {/* Reopening a marked day should say so, not look like a blank sheet. */}
          {saved.isMarked && students.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
                padding: '10px 16px',
                borderRadius: 'var(--radius-md)',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#047857',
                fontSize: '0.875rem',
              }}
            >
              <ClipboardCheck size={15} />
              This register was already taken
              {saved.markedBy &&
                ` by ${saved.markedBy.firstName} ${saved.markedBy.lastName}`}
              . Saving again will update it.
            </div>
          )}

          {/* ── Student list ──────────────────────────────────────────── */}
          <div className="card">
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
                <span
                  style={{ fontSize: '0.9375rem', color: 'var(--clr-text-3)' }}
                >
                  Loading register...
                </span>
              </div>
            ) : !selectedClass ? (
              <div className="empty-state" style={{ padding: '56px 24px' }}>
                <Users size={44} className="empty-state__icon" />
                <p className="empty-state__title">No Class Selected</p>
                <p className="empty-state__text">
                  Choose a class above to load its register.
                </p>
              </div>
            ) : students.length === 0 ? (
              <div className="empty-state" style={{ padding: '56px 24px' }}>
                <Users size={44} className="empty-state__icon" />
                <p className="empty-state__title">No Students Found</p>
                <p className="empty-state__text">
                  No students are assigned to{' '}
                  <strong>{selectedClassName}</strong> yet. Open{' '}
                  <strong>Students</strong> and make sure each student has this
                  class set in their profile.
                </p>
              </div>
            ) : (
              <div>
                {students.map((student, idx) => {
                  const status = records[student._id] || 'Present';
                  const initials = `${student.firstName?.[0] || '?'}${
                    student.lastName?.[0] || ''
                  }`;

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
                        background:
                          status === 'Absent' ? '#fff8f8' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
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
                                border: `1.5px solid ${
                                  active
                                    ? STATUS_COLORS[s]
                                    : 'var(--clr-border)'
                                }`,
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
                    <span
                      style={{ color: STATUS_COLORS.Present, fontWeight: 600 }}
                    >
                      {summary.Present} present
                    </span>
                    {summary.Absent > 0 && (
                      <span
                        style={{ color: STATUS_COLORS.Absent, fontWeight: 600 }}
                      >
                        , {summary.Absent} absent
                      </span>
                    )}
                    {' · '}
                    {format(new Date(`${date}T12:00:00`), 'EEEE, dd MMMM yyyy')}
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
      )}
    </>
  );
}
