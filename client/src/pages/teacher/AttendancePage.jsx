import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Save, AlertCircle } from 'lucide-react';
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

export default function AttendancePage() {
  const { user } = useAuthStore();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [term] = useState('First Term');
  const [academicYear] = useState('2024/2025');

  useEffect(() => {
    // If teacher has a class assigned, preselect it
    const myClass = user?.teacherProfile?.classTeacherOf;
    classService.getAll().then((r) => {
      setClasses(r.data.data.classes || []);
      if (myClass)
        setSelectedClass(typeof myClass === 'object' ? myClass._id : myClass);
    });
  }, []);

  useEffect(() => {
    if (!selectedClass) {
      setStudents([]);
      setRecords({});
      return;
    }
    setLoading(true);
    Promise.all([
      userService.getByClass(selectedClass),
      attendanceService.getClassAttendance(selectedClass, { date }),
    ])
      .then(([studRes, attRes]) => {
        const studs = studRes.data.data.students || [];
        setStudents(studs);
        const existingRecords = {};
        (attRes.data.data?.records || []).forEach((r) => {
          existingRecords[r.student._id] = r.status;
        });
        // Default everyone to Present if no records yet
        const defaultRecords = {};
        studs.forEach((s) => {
          defaultRecords[s._id] = existingRecords[s._id] || 'Present';
        });
        setRecords(defaultRecords);
      })
      .catch(() => toast.error('Failed to load students'))
      .finally(() => setLoading(false));
  }, [selectedClass, date]);

  const setAllStatus = (status) => {
    const updated = {};
    students.forEach((s) => {
      updated[s._id] = status;
    });
    setRecords(updated);
  };

  const handleSave = async () => {
    if (!selectedClass) return toast.error('Select a class first');
    setSaving(true);
    try {
      const payload = {
        classId: selectedClass,
        date,
        term,
        academicYear,
        records: students.map((s) => ({
          student: s._id,
          status: records[s._id] || 'Present',
        })),
      };
      await attendanceService.mark(payload);
      toast.success(`Attendance saved for ${students.length} students`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const summary = STATUSES.reduce((acc, s) => {
    acc[s] = Object.values(records).filter((v) => v === s).length;
    return acc;
  }, {});

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
          <Save size={16} /> {saving ? 'Saving...' : 'Save Attendance'}
        </button>
      </div>

      {/* Controls */}
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
            {['Present', 'Absent'].map((s) => (
              <button
                key={s}
                className="btn btn--secondary btn--sm"
                onClick={() => setAllStatus(s)}
              >
                All {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Bar */}
      {students.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 24,
            flexWrap: 'wrap',
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
        </div>
      )}

      {/* Student List */}
      <div className="card">
        {loading ? (
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: 60 }}
          >
            <div className="spinner" />
          </div>
        ) : students.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No Students</p>
            <p className="empty-state__text">
              Select a class to start marking attendance
            </p>
          </div>
        ) : (
          <div style={{ padding: '0 4px' }}>
            {students.map((student, idx) => {
              const status = records[student._id] || 'Present';
              const initials = `${student.firstName[0]}${student.lastName[0]}`;
              return (
                <div
                  key={student._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '14px 20px',
                    borderBottom:
                      idx < students.length - 1
                        ? '1px solid var(--clr-border)'
                        : 'none',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Rank */}
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

                  {/* Name */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
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

                  {/* Status Buttons */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
          </div>
        )}
      </div>
    </>
  );
}
