import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Timer,
  Pencil,
  CalendarDays,
  DoorOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../components/common/Modal';
import { staffAttendanceService } from '../../services/api';
import {
  DEFAULT_UTC_OFFSET_MINUTES,
  formatSchoolTime,
  formatDayKey,
  formatDuration,
  toDayKey,
  dayKeyAgo,
} from '../../utils/schoolTime';

const STATUS_COLORS = {
  Present: '#10B981',
  Late: '#F59E0B',
  Absent: '#EF4444',
  Excused: '#6366F1',
};

const STATUSES = ['Present', 'Late', 'Absent', 'Excused'];

const TABS = [
  { key: 'daily', label: 'Daily roster' },
  { key: 'summary', label: 'By staff' },
];

const initials = (staff) =>
  `${staff?.firstName?.[0] || ''}${staff?.lastName?.[0] || ''}`.toUpperCase();

const fullName = (staff) =>
  `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim();

/** The name cell, shared by both tables. */
const StaffCell = ({ staff, staffId }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: 'var(--clr-primary-50, #EEF3FD)',
        color: 'var(--clr-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.8125rem',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials(staff)}
    </div>
    <div>
      <div style={{ fontWeight: 600 }}>{fullName(staff)}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)' }}>
        {staffId || staff?.staffId || staff?.teacherProfile?.staffId || staff?.role}
      </div>
    </div>
  </div>
);

const StatusBadge = ({ status, muted }) => (
  <span
    className="badge"
    style={{
      background: `${STATUS_COLORS[status]}18`,
      color: STATUS_COLORS[status],
      fontWeight: 600,
      opacity: muted ? 0.65 : 1,
    }}
  >
    {status}
  </span>
);

export default function StaffAttendancePage() {
  const [tab, setTab] = useState('daily');
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(toDayKey());
  const [role, setRole] = useState('');
  const [daily, setDaily] = useState(null);

  const [range, setRange] = useState({ from: dayKeyAgo(29), to: toDayKey() });
  const [summary, setSummary] = useState([]);
  const [overall, setOverall] = useState(null);

  // The row being corrected, and the form standing in front of it.
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    status: 'Present',
    clockInAt: '',
    clockOutAt: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);

  const offset = daily?.workDay?.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES;

  const loadDaily = useCallback(() => {
    setLoading(true);

    const params = { date };
    if (role) params.role = role;

    staffAttendanceService
      .getDaily(params)
      .then(({ data }) => setDaily(data.data))
      .catch((err) =>
        toast.error(err.response?.data?.message || 'Could not load the roster'),
      )
      .finally(() => setLoading(false));
  }, [date, role]);

  const loadSummary = useCallback(() => {
    setLoading(true);

    staffAttendanceService
      .getSummary({ from: range.from, to: range.to })
      .then(({ data }) => {
        setSummary(data.data?.summary || []);
        setOverall(data.data?.overall || null);
      })
      .catch((err) =>
        toast.error(err.response?.data?.message || 'Could not load the summary'),
      )
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => {
    if (tab === 'daily') loadDaily();
    else loadSummary();
  }, [tab, loadDaily, loadSummary]);

  const openEditor = (row) => {
    setEditing(row);
    setForm({
      status: row.recorded ? row.status : 'Present',
      clockInAt: row.clockInAt ? formatSchoolTime(row.clockInAt, offset) : '',
      clockOutAt: row.clockOutAt ? formatSchoolTime(row.clockOutAt, offset) : '',
      note: row.record?.adminNote || '',
    });
  };

  const save = async () => {
    setSaving(true);

    try {
      const clears = form.status === 'Absent' || form.status === 'Excused';

      // `mark` upserts by staff and date, so it covers both a first record and
      // a correction to an existing one — there is no branch here for whether
      // the person clocked in.
      const { data } = await staffAttendanceService.mark({
        staff: editing.staff._id,
        status: form.status,
        date,
        note: form.note.trim() || undefined,
        // Times contradict an absence, so they are only sent when they can
        // stand: the server clears them either way.
        clockInAt: clears ? undefined : form.clockInAt || undefined,
        clockOutAt: clears ? undefined : form.clockOutAt || undefined,
      });

      toast.success(data.message);
      setEditing(null);
      loadDaily();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save that');
    } finally {
      setSaving(false);
    }
  };

  const counts = daily?.counts;

  const dailyTiles = counts
    ? [
        {
          label: 'On site',
          value: (counts.Present || 0) + (counts.Late || 0),
          color: STATUS_COLORS.Present,
          icon: CheckCircle2,
        },
        {
          label: 'Late',
          value: counts.Late || 0,
          color: STATUS_COLORS.Late,
          icon: AlertTriangle,
        },
        {
          label: 'Not accounted for',
          value: counts.unaccounted || 0,
          color: STATUS_COLORS.Absent,
          icon: UserX,
        },
        {
          label: 'Still clocked in',
          value: counts.stillIn || 0,
          color: '#0891B2',
          icon: DoorOpen,
        },
      ]
    : [];

  const summaryTiles = overall
    ? [
        {
          label: 'Days recorded',
          value: overall.total || 0,
          color: '#1A4FAB',
          icon: CalendarDays,
        },
        {
          label: 'Turned up',
          value: overall.attended || 0,
          color: STATUS_COLORS.Present,
          icon: CheckCircle2,
        },
        {
          label: 'Late days',
          value: overall.Late || 0,
          color: STATUS_COLORS.Late,
          icon: AlertTriangle,
        },
        {
          label: 'Average day',
          value: formatDuration(overall.averageWorkedMinutes),
          color: '#6366F1',
          icon: Timer,
        },
      ]
    : [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Staff Attendance</h1>
          <p className="page-header__subtitle">
            {daily?.workDay
              ? `Who was on site, and when. School hours ${daily.workDay.start} – ${daily.workDay.end}.`
              : 'Who was on site, and when'}
          </p>
        </div>
      </div>

      <div
        style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}
      >
        {TABS.map((entry) => (
          <button
            key={entry.key}
            className={`btn btn--sm ${
              tab === entry.key ? 'btn--primary' : 'btn--secondary'
            }`}
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'daily' ? (
        <>
          {counts && (
            <div className="stats-grid">
              {dailyTiles.map((tile) => (
                <div
                  key={tile.label}
                  className="stat-card"
                  style={{ '--accent-color': tile.color }}
                >
                  <div className="stat-card__icon">
                    <tile.icon size={22} />
                  </div>
                  <div className="stat-card__content">
                    <div className="stat-card__label">{tile.label}</div>
                    <div className="stat-card__value">{tile.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card" style={{ marginBottom: 24 }}>
            <div
              className="card__body"
              style={{
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                alignItems: 'flex-end',
              }}
            >
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={date}
                  max={toDayKey()}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div
                className="form-group"
                style={{ marginBottom: 0, minWidth: 180 }}
              >
                <label>Staff</label>
                <select
                  className="form-control"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="">All staff</option>
                  <option value="Teacher">Teachers</option>
                  <option value="Admin">Admins</option>
                </select>
              </div>

              {daily && !daily.isWorkingDay && (
                <span
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--clr-text-3)',
                    paddingBottom: 10,
                  }}
                >
                  {formatDayKey(daily.date)} is not a school day.
                </span>
              )}
            </div>
          </div>

          <div className="card">
            {loading ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: 64,
                }}
              >
                <div className="spinner" />
              </div>
            ) : !daily?.roster?.length ? (
              <div className="empty-state" style={{ padding: '56px 24px' }}>
                <Users size={44} className="empty-state__icon" />
                <p className="empty-state__title">No staff to show</p>
                <p className="empty-state__text">
                  Nobody active matches this filter.
                </p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>On site</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.roster.map((row) => (
                      <tr key={row.staff._id}>
                        <td>
                          <StaffCell
                            staff={row.staff}
                            staffId={row.staff?.teacherProfile?.staffId}
                          />
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatSchoolTime(row.clockInAt, offset)}
                          {row.minutesLate > 0 && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: '0.75rem',
                                color: STATUS_COLORS.Late,
                                fontWeight: 600,
                              }}
                            >
                              +{row.minutesLate}m
                            </span>
                          )}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {row.isOpen ? (
                            <span style={{ color: '#0891B2', fontWeight: 600 }}>
                              still in
                            </span>
                          ) : (
                            formatSchoolTime(row.clockOutAt, offset)
                          )}
                        </td>
                        <td>{formatDuration(row.workedMinutes)}</td>
                        <td>
                          {/* A muted badge is the tell that nobody recorded
                              anything — as opposed to a deliberate mark. */}
                          <StatusBadge
                            status={row.status}
                            muted={!row.recorded}
                          />
                          {!row.recorded && (
                            <div
                              style={{
                                fontSize: '0.6875rem',
                                color: 'var(--clr-text-3)',
                                marginTop: 2,
                              }}
                            >
                              not recorded
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn--secondary btn--sm"
                            onClick={() => openEditor(row)}
                          >
                            <Pencil size={14} />
                            {row.recorded ? 'Correct' : 'Record'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {overall && (
            <div className="stats-grid">
              {summaryTiles.map((tile) => (
                <div
                  key={tile.label}
                  className="stat-card"
                  style={{ '--accent-color': tile.color }}
                >
                  <div className="stat-card__icon">
                    <tile.icon size={22} />
                  </div>
                  <div className="stat-card__content">
                    <div className="stat-card__label">{tile.label}</div>
                    <div className="stat-card__value">{tile.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card" style={{ marginBottom: 24 }}>
            <div
              className="card__body"
              style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}
            >
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>From</label>
                <input
                  type="date"
                  className="form-control"
                  value={range.from}
                  max={range.to}
                  onChange={(e) =>
                    setRange((r) => ({ ...r, from: e.target.value }))
                  }
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>To</label>
                <input
                  type="date"
                  className="form-control"
                  value={range.to}
                  min={range.from}
                  onChange={(e) =>
                    setRange((r) => ({ ...r, to: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="card">
            {loading ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: 64,
                }}
              >
                <div className="spinner" />
              </div>
            ) : !summary.length ? (
              <div className="empty-state" style={{ padding: '56px 24px' }}>
                <CalendarDays size={44} className="empty-state__icon" />
                <p className="empty-state__title">Nothing recorded</p>
                <p className="empty-state__text">
                  No attendance was recorded between these dates.
                </p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Days</th>
                      <th>Present</th>
                      <th>Late</th>
                      <th>Absent</th>
                      <th>Excused</th>
                      <th>Total on site</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row) => (
                      <tr key={row.staff._id}>
                        <td>
                          <StaffCell
                            staff={row.staff}
                            staffId={row.staff.staffId}
                          />
                        </td>
                        <td>{row.days}</td>
                        <td>{row.present}</td>
                        <td>
                          {row.late}
                          {row.lateMinutes > 0 && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: '0.75rem',
                                color: 'var(--clr-text-3)',
                              }}
                            >
                              ({formatDuration(row.lateMinutes)} late)
                            </span>
                          )}
                        </td>
                        <td>{row.absent}</td>
                        <td>{row.excused}</td>
                        <td>{formatDuration(row.workedMinutes)}</td>
                        <td>
                          <span
                            style={{
                              fontWeight: 700,
                              color:
                                row.attendanceRate >= 90
                                  ? STATUS_COLORS.Present
                                  : row.attendanceRate >= 75
                                    ? STATUS_COLORS.Late
                                    : STATUS_COLORS.Absent,
                            }}
                          >
                            {row.attendanceRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Record or correct one day ─────────────────────────────────── */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`${fullName(editing?.staff)} · ${formatDayKey(date)}`}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Status</label>
          <select
            className="form-control"
            value={form.status}
            onChange={(e) =>
              setForm((f) => ({ ...f, status: e.target.value }))
            }
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {form.status === 'Present' || form.status === 'Late' ? (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
              <label>Clock in</label>
              <input
                type="time"
                className="form-control"
                value={form.clockInAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clockInAt: e.target.value }))
                }
              />
            </div>

            <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
              <label>Clock out</label>
              <input
                type="time"
                className="form-control"
                value={form.clockOutAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clockOutAt: e.target.value }))
                }
              />
            </div>
          </div>
        ) : (
          <p
            style={{
              marginBottom: 16,
              fontSize: '0.875rem',
              color: 'var(--clr-text-3)',
            }}
          >
            Recording {form.status.toLowerCase()} clears any clock times on this
            day.
          </p>
        )}

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>
            Reason{' '}
            <span style={{ color: 'var(--clr-text-3)', fontWeight: 400 }}>
              (optional, visible to the staff member)
            </span>
          </label>
          <textarea
            className="form-control"
            rows={3}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Approved leave, forgot to clock in, gate log says 07:50…"
          />
        </div>
      </Modal>
    </>
  );
}
