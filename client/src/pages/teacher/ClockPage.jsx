import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock,
  LogIn,
  LogOut,
  CalendarDays,
  Timer,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
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

export default function ClockPage() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Which of the two actions the note modal is collecting for.
  const [action, setAction] = useState(null);
  const [note, setNote] = useState('');

  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [page, setPage] = useState(1);
  const [range, setRange] = useState({
    from: dayKeyAgo(29),
    to: toDayKey(),
  });

  // Ticks once a second so the header clock and the running total stay live.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const offset = state?.workDay?.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES;

  const loadState = useCallback(
    () =>
      staffAttendanceService
        .getToday()
        .then(({ data }) => setState(data.data))
        .catch((err) =>
          toast.error(
            err.response?.data?.message || 'Could not load your clock',
          ),
        ),
    [],
  );

  const loadHistory = useCallback(() => {
    const params = { page, limit: 20 };
    if (range.from) params.from = range.from;
    if (range.to) params.to = range.to;

    return staffAttendanceService
      .getMine(params)
      .then(({ data }) => {
        setHistory(data.data?.records || []);
        setSummary(data.data?.summary || null);
        setMeta(data.meta || { page: 1, pages: 1, total: 0, limit: 20 });
      })
      .catch((err) =>
        toast.error(err.response?.data?.message || 'Could not load history'),
      );
  }, [page, range]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadState(), loadHistory()]).finally(() => setLoading(false));
  }, [loadState, loadHistory]);

  const submit = async () => {
    setSaving(true);

    try {
      const body = note.trim() ? { note: note.trim() } : {};

      const { data } =
        action === 'in'
          ? await staffAttendanceService.clockIn(body)
          : await staffAttendanceService.clockOut(body);

      setState(data.data);
      toast.success(data.message);
      setAction(null);
      setNote('');
      loadHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'That did not go through');

      // A conflict means the server's view has moved on from the screen's —
      // most often a second tab, or a tap that landed twice. Re-reading is the
      // only way the buttons stop lying about what is possible.
      if (err.response?.status === 409) {
        setAction(null);
        loadState();
      }
    } finally {
      setSaving(false);
    }
  };

  const record = state?.record;

  // Time on site so far, for a day that is still open.
  const runningMinutes = useMemo(() => {
    if (!record?.clockIn?.at || record?.clockOut?.at) return null;
    return Math.max(0, Math.round((now - new Date(record.clockIn.at)) / 60000));
  }, [record, now]);

  const tiles = summary
    ? [
        {
          label: 'Days present',
          value: summary.Present || 0,
          color: STATUS_COLORS.Present,
          icon: CheckCircle2,
        },
        {
          label: 'Days late',
          value: summary.Late || 0,
          color: STATUS_COLORS.Late,
          icon: AlertTriangle,
        },
        {
          label: 'Average day',
          value: formatDuration(summary.averageWorkedMinutes),
          color: '#1A4FAB',
          icon: Timer,
        },
        {
          label: 'Attendance',
          value: `${summary.attendanceRate ?? 0}%`,
          color: '#6366F1',
          icon: CalendarDays,
        },
      ]
    : [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Clock In &amp; Out</h1>
          <p className="page-header__subtitle">
            {state?.workDay
              ? `School hours ${state.workDay.start} – ${state.workDay.end}, with ${state.workDay.graceMinutes} minutes' grace`
              : 'Record your arrival and departure'}
          </p>
        </div>
      </div>

      {/* ── The clock itself ──────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card__body">
          {loading && !state ? (
            <div
              style={{ display: 'flex', justifyContent: 'center', padding: 48 }}
            >
              <div className="spinner" />
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 24,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--clr-text-3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 700,
                  }}
                >
                  {formatDayKey(state?.date)}
                  {state && !state.isWorkingDay && ' · not a school day'}
                </div>

                <div
                  style={{
                    fontSize: '3rem',
                    fontWeight: 700,
                    lineHeight: 1.1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatSchoolTime(now, offset)}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    flexWrap: 'wrap',
                    marginTop: 12,
                    fontSize: '0.9375rem',
                    color: 'var(--clr-text-2)',
                  }}
                >
                  <span>
                    In:{' '}
                    <strong>
                      {formatSchoolTime(record?.clockIn?.at, offset)}
                    </strong>
                  </span>
                  <span>
                    Out:{' '}
                    <strong>
                      {formatSchoolTime(record?.clockOut?.at, offset)}
                    </strong>
                  </span>
                  <span>
                    On site:{' '}
                    <strong>
                      {formatDuration(runningMinutes ?? record?.workedMinutes)}
                    </strong>
                  </span>
                </div>

                {record?.status && (
                  <span
                    className="badge"
                    style={{
                      marginTop: 12,
                      display: 'inline-block',
                      background: `${STATUS_COLORS[record.status]}18`,
                      color: STATUS_COLORS[record.status],
                      fontWeight: 600,
                    }}
                  >
                    {record.status}
                    {record.clockIn?.minutesLate > 0 &&
                      ` · ${record.clockIn.minutesLate} min after start`}
                  </span>
                )}

                {record?.adminNote && (
                  <p
                    style={{
                      marginTop: 10,
                      fontSize: '0.875rem',
                      color: 'var(--clr-text-3)',
                    }}
                  >
                    Office note: {record.adminNote}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {state?.canClockIn && (
                  <button
                    className="btn btn--primary"
                    onClick={() => {
                      setAction('in');
                      setNote('');
                    }}
                  >
                    <LogIn size={16} />
                    Clock In
                  </button>
                )}

                {state?.canClockOut && (
                  <button
                    className="btn btn--secondary"
                    onClick={() => {
                      setAction('out');
                      setNote('');
                    }}
                  >
                    <LogOut size={16} />
                    Clock Out
                  </button>
                )}

                {state && !state.canClockIn && !state.canClockOut && (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: 'var(--clr-text-3)',
                      fontSize: '0.9375rem',
                    }}
                  >
                    <Clock size={16} />
                    {record?.status === 'Excused'
                      ? 'Recorded as leave by the office'
                      : "You're done for today"}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tiles ─────────────────────────────────────────────────────── */}
      {summary && (
        <div className="stats-grid">
          {tiles.map((tile) => (
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

      {/* ── History ───────────────────────────────────────────────────── */}
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
              onChange={(e) => {
                setPage(1);
                setRange((r) => ({ ...r, from: e.target.value }));
              }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input
              type="date"
              className="form-control"
              value={range.to}
              min={range.from}
              onChange={(e) => {
                setPage(1);
                setRange((r) => ({ ...r, to: e.target.value }));
              }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: 64 }}
          >
            <div className="spinner" />
          </div>
        ) : !history.length ? (
          <div className="empty-state" style={{ padding: '56px 24px' }}>
            <CalendarDays size={44} className="empty-state__icon" />
            <p className="empty-state__title">Nothing recorded</p>
            <p className="empty-state__text">
              Days you clock in for will be listed here.
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>Hours Worked</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row._id}>
                      <td>{formatDayKey(row.date)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatSchoolTime(row.clockIn?.at, offset)}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatSchoolTime(row.clockOut?.at, offset)}
                      </td>
                      <td>{formatDuration(row.workedMinutes)}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: `${STATUS_COLORS[row.status]}18`,
                            color: STATUS_COLORS[row.status],
                            fontWeight: 600,
                          }}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td
                        style={{
                          color: 'var(--clr-text-3)',
                          fontSize: '0.875rem',
                        }}
                      >
                        {row.adminNote || row.clockIn?.note || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {meta.pages > 1 && (
              <Pagination
                page={meta.page}
                pages={meta.pages}
                total={meta.total}
                limit={meta.limit}
                onChange={setPage}
              />
            )}
          </>
        )}
      </div>

      {/* ── Confirm ───────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action === 'in' ? 'Clock in' : 'Clock out'}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => setAction(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={submit}
              disabled={saving}
            >
              {saving
                ? 'Recording…'
                : `Confirm ${formatSchoolTime(now, offset)}`}
            </button>
          </>
        }
      >
        <p style={{ marginBottom: 16, color: 'var(--clr-text-2)' }}>
          {action === 'in'
            ? `Recording your arrival at ${formatSchoolTime(now, offset)}. School starts at ${state?.workDay?.start}.`
            : `Recording your departure at ${formatSchoolTime(now, offset)}.`}
        </p>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>
            Note{' '}
            <span style={{ color: 'var(--clr-text-3)', fontWeight: 400 }}>
              (optional)
            </span>
          </label>
          <textarea
            className="form-control"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              action === 'in'
                ? 'Anything the office should know — traffic, a school run…'
                : 'Leaving early for a meeting, staying back to mark…'
            }
          />
        </div>
      </Modal>
    </>
  );
}
