import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert,
  Activity,
  UserX,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { auditService } from '../../services/api';
import Pagination from '../../components/common/Pagination';

/**
 * The audit trail, for the people who have to answer "who changed this".
 *
 * Read-only by design — there is no endpoint to edit or delete an entry, and
 * nothing here pretends otherwise.
 */

// Grouping actions by domain lets the filter offer something meaningful before
// any entries exist, and gives each row a colour without a lookup table per
// action name.
const DOMAIN_META = {
  result: { label: 'Results', badge: 'info' },
  payment: { label: 'Payments', badge: 'success' },
  fee: { label: 'Fees', badge: 'success' },
  user: { label: 'Users', badge: 'warning' },
  auth: { label: 'Authentication', badge: 'neutral' },
  certificate: { label: 'Certificates', badge: 'info' },
  promotion: { label: 'Promotions', badge: 'info' },
};

const domainOf = (action = '') => action.split('.')[0];

// 'result.bulk_upsert' → 'Bulk upsert'
const humanizeAction = (action = '') => {
  const verb = action.split('.').slice(1).join(' ') || action;
  const spaced = verb.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const RANGES = [
  { label: 'Last 24 hours', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

const EMPTY_FILTERS = {
  action: '',
  outcome: '',
  from: '',
  to: '',
};

/** Render one changed field as "from → to". */
const ChangeRow = ({ field, change }) => (
  <div className="audit-change">
    <span className="audit-change__field">{field}</span>
    <span className="audit-change__from">
      {change.from === undefined || change.from === ''
        ? '—'
        : String(change.from)}
    </span>
    <ChevronRight size={13} className="audit-change__arrow" />
    <span className="audit-change__to">
      {change.to === undefined || change.to === '' ? '—' : String(change.to)}
    </span>
  </div>
);

/** The expanded detail for a single entry. */
const EntryDetail = ({ entry }) => {
  const changes = Object.entries(entry.changes || {});
  const meta = Object.entries(entry.meta || {});

  return (
    <div className="audit-detail">
      {changes.length > 0 && (
        <div className="audit-detail__section">
          <h4>What changed</h4>
          {changes.map(([field, change]) => (
            <ChangeRow key={field} field={field} change={change} />
          ))}
        </div>
      )}

      {meta.length > 0 && (
        <div className="audit-detail__section">
          <h4>Details</h4>
          <dl className="audit-meta">
            {meta.map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>
                  {typeof value === 'object' && value !== null
                    ? JSON.stringify(value)
                    : String(value)}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      )}

      <div className="audit-detail__section">
        <h4>Origin</h4>
        <dl className="audit-meta">
          <dt>IP address</dt>
          <dd>{entry.ip || '—'}</dd>
          <dt>Device</dt>
          <dd className="audit-meta__ua">{entry.userAgent || '—'}</dd>
          {entry.reason && (
            <>
              <dt>Reason</dt>
              <dd>{entry.reason}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1, limit: 25 });
  const [summary, setSummary] = useState(null);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState(null);
  const [range, setRange] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 25 };
      if (filters.action) params.action = filters.action;
      if (filters.outcome) params.outcome = filters.outcome;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      const res = await auditService.getLog(params);
      setEntries(res.data.data || []);
      setMeta(res.data.meta || { total: 0, pages: 1, limit: 25 });
    } catch (err) {
      toast.error(
        err.response?.data?.message || 'Failed to load the audit log',
      );
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    auditService
      .getSummary({ days: range })
      .then((res) => setSummary(res.data.data))
      .catch(() => setSummary(null));
  }, [range]);

  useEffect(() => {
    auditService
      .getActions()
      .then((res) => setActions(res.data.data?.actions || []))
      .catch(() => setActions([]));
  }, []);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters(EMPTY_FILTERS);
  };

  const hasFilters = Object.values(filters).some(Boolean);

  // Only offer domains that have actually been recorded.
  const domains = [...new Set(actions.map(domainOf))].filter(Boolean).sort();

  const stats = summary
    ? [
        {
          label: 'Recorded actions',
          value: summary.total.toLocaleString(),
          icon: Activity,
          color: '#1A4FAB',
        },
        {
          label: 'Failed attempts',
          value: summary.failures.toLocaleString(),
          icon: ShieldAlert,
          color: summary.failures > 0 ? '#EF4444' : '#10B981',
        },
        {
          label: 'Most active',
          value: summary.byActor?.[0]?.actorName || '—',
          sub: summary.byActor?.[0]
            ? `${summary.byActor[0].count} actions`
            : undefined,
          icon: UserX,
          color: '#7C3AED',
        },
      ]
    : [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Audit Log</h1>
          <p className="page-header__subtitle">
            Every change to grades, fees and accounts — who made it, and when.
          </p>
        </div>

        <select
          className="form-control"
          style={{ maxWidth: 190 }}
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
          aria-label="Summary period"
        >
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {stats.length > 0 && (
        <div className="stats-grid">
          {stats.map((s) => (
            <div
              key={s.label}
              className="stat-card"
              style={{ '--accent-color': s.color }}
            >
              <div className="stat-card__icon">
                <s.icon size={22} />
              </div>
              <div className="stat-card__content">
                <div className="stat-card__label">{s.label}</div>
                <div className="stat-card__value">{s.value}</div>
                {s.sub && <div className="stat-card__meta">{s.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="audit-filters">
          <div className="audit-filters__field">
            <label htmlFor="audit-domain">Area</label>
            <select
              id="audit-domain"
              className="form-control"
              value={filters.action}
              onChange={(e) => updateFilter('action', e.target.value)}
            >
              <option value="">All areas</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {DOMAIN_META[d]?.label || d}
                </option>
              ))}
            </select>
          </div>

          <div className="audit-filters__field">
            <label htmlFor="audit-outcome">Outcome</label>
            <select
              id="audit-outcome"
              className="form-control"
              value={filters.outcome}
              onChange={(e) => updateFilter('outcome', e.target.value)}
            >
              <option value="">Any outcome</option>
              <option value="success">Successful</option>
              <option value="failure">Failed</option>
            </select>
          </div>

          <div className="audit-filters__field">
            <label htmlFor="audit-from">From</label>
            <input
              id="audit-from"
              type="date"
              className="form-control"
              value={filters.from}
              onChange={(e) => updateFilter('from', e.target.value)}
            />
          </div>

          <div className="audit-filters__field">
            <label htmlFor="audit-to">To</label>
            <input
              id="audit-to"
              type="date"
              className="form-control"
              value={filters.to}
              onChange={(e) => updateFilter('to', e.target.value)}
            />
          </div>

          {hasFilters && (
            <button
              className="btn btn--secondary btn--sm"
              onClick={clearFilters}
            >
              <X size={15} /> Clear
            </button>
          )}

          <button
            className="btn btn--secondary btn--sm"
            onClick={load}
            title="Refresh"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: 60 }}
          >
            <div className="spinner" />
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <Search size={38} />
            <h3>Nothing recorded yet</h3>
            <p>
              {hasFilters
                ? 'No entries match these filters. Try widening the date range.'
                : 'Audit entries appear here as soon as grades, fees or accounts are changed.'}
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="table audit-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }} />
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Record</th>
                    <th>Concerning</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const domain = domainOf(entry.action);
                    const isOpen = expanded === entry._id;
                    const hasDetail =
                      entry.changes || entry.meta || entry.ip || entry.reason;

                    return (
                      <React.Fragment key={entry._id}>
                        <tr
                          className={isOpen ? 'is-expanded' : undefined}
                          onClick={() =>
                            hasDetail && setExpanded(isOpen ? null : entry._id)
                          }
                          style={{ cursor: hasDetail ? 'pointer' : 'default' }}
                        >
                          <td>
                            {hasDetail &&
                              (isOpen ? (
                                <ChevronDown size={15} />
                              ) : (
                                <ChevronRight size={15} />
                              ))}
                          </td>
                          <td className="audit-table__when">
                            {format(new Date(entry.createdAt), 'd MMM yyyy')}
                            <span>
                              {format(new Date(entry.createdAt), 'HH:mm:ss')}
                            </span>
                          </td>
                          <td>
                            {entry.actorName || (
                              <span className="text-muted">Not signed in</span>
                            )}
                            {entry.actorRole && (
                              <span className="audit-table__role">
                                {entry.actorRole}
                              </span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`badge badge--${
                                DOMAIN_META[domain]?.badge || 'neutral'
                              }`}
                            >
                              {DOMAIN_META[domain]?.label || domain}
                            </span>
                            <span className="audit-table__verb">
                              {humanizeAction(entry.action)}
                            </span>
                          </td>
                          <td>{entry.entityLabel || entry.entity}</td>
                          <td>
                            {entry.subject
                              ? `${entry.subject.firstName || ''} ${
                                  entry.subject.lastName || ''
                                }`.trim() || '—'
                              : '—'}
                          </td>
                          <td>
                            <span
                              className={`badge badge--${
                                entry.outcome === 'failure'
                                  ? 'danger'
                                  : 'success'
                              }`}
                            >
                              {entry.outcome === 'failure'
                                ? 'Failed'
                                : 'Success'}
                            </span>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr className="audit-table__detail-row">
                            <td colSpan={7}>
                              <EntryDetail entry={entry} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              pages={meta.pages}
              total={meta.total}
              limit={meta.limit}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
