import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { calendarService } from '../../services/api';
import { useQuickActionItems } from '../common/QuickActionsModal';
import useFeatureStore from '../../store/featureStore';
import './dashboard.scss';

ChartJS.register(ArcElement, Tooltip);

const ROLE_HOME = {
  Admin: '/admin',
  Teacher: '/teacher',
  Student: '/student',
  Parent: '/parent',
};

/**
 * The page's heading. A phone has no room for the school's name in the topbar,
 * so it sits here instead: on a parent's phone it is the only thing saying which
 * school's portal this is.
 */
export function DashHeader({ title, subtitle, children }) {
  const schoolName = useFeatureStore((s) => s.school?.name);

  return (
    <div className="page-header dash-header">
      <div style={{ minWidth: 0 }}>
        {schoolName && (
          <div className="dash-header__school only-mobile">{schoolName}</div>
        )}
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * The row of shortcuts along the top of a dashboard.
 *
 * Reads the Quick Actions modal's own list, picked by destination, so a tile
 * cannot drift from the modal: a feature this school does not run drops out, and
 * "Make a Payment" becomes "Fee Balance", exactly as it does there.
 */
export function QuickTiles({ role, paths }) {
  const navigate = useNavigate();
  const items = useQuickActionItems(role);

  const tiles = paths
    .map((path) => items.find((item) => item.to === path))
    .filter(Boolean);

  return (
    <nav className="quick-tiles" aria-label="Shortcuts">
      {tiles.map((item) => (
        <button
          key={item.to}
          type="button"
          className="quick-tile"
          onClick={() =>
            navigate(
              item.to,
              item.action ? { state: { quickAction: item.action } } : undefined,
            )
          }
        >
          <span className="quick-tile__icon">
            <item.icon size={18} />
          </span>
          <span className="quick-tile__label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** A number and what it counts. With a destination, the whole tile is the link. */
export function StatTile({ label, value, sub, icon: Icon, to }) {
  const navigate = useNavigate();
  const Tag = to ? 'button' : 'div';

  return (
    <Tag
      {...(to ? { type: 'button', onClick: () => navigate(to) } : {})}
      className={`stat-tile${to ? ' stat-tile--link' : ''}`}
    >
      <span className="stat-tile__value">{value}</span>
      <span className="stat-tile__label">
        {Icon && <Icon size={14} />}
        {label}
        {to && <ChevronRight size={15} className="stat-tile__chevron" />}
      </span>
      {sub && <span className="stat-tile__sub">{sub}</span>}
    </Tag>
  );
}

// Normal notices alternate between two tints, for rhythm only. Priority is what
// carries meaning, and it is always written out, so it never rests on colour.
const noticeTone = (priority, index) => {
  if (priority === 'Urgent') return 'urgent';
  if (priority === 'High') return 'high';
  return index % 2 === 0 ? 'green' : 'blue';
};

const safeDate = (value, pattern) => {
  const date = value ? new Date(value) : null;
  return date && isValid(date) ? format(date, pattern) : '';
};

export function Noticeboard({ announcements = [], role, canPost = false }) {
  const navigate = useNavigate();
  const page = `${ROLE_HOME[role]}/announcements`;

  return (
    <section className="card dash-card">
      <div className="card__header">
        <h2 className="card__title">Noticeboard</h2>
        <div className="dash-card__actions">
          {canPost && (
            <button
              type="button"
              className="dash-round-btn dash-round-btn--solid"
              aria-label="New announcement"
              title="New announcement"
              onClick={() =>
                navigate(page, { state: { quickAction: 'announcement' } })
              }
            >
              <Plus size={18} />
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => navigate(page)}
          >
            View all
          </button>
        </div>
      </div>

      <div className="noticeboard">
        {announcements.length === 0 ? (
          <div className="empty-state" style={{ padding: 32 }}>
            <Bell size={28} className="empty-state__icon" />
            <p className="empty-state__text">Nothing on the noticeboard yet</p>
          </div>
        ) : (
          announcements.map((notice, index) => (
            <article
              key={notice._id}
              className={`notice notice--${noticeTone(notice.priority, index)}`}
            >
              <div className="notice__head">
                <h3 className="notice__title">{notice.title}</h3>
                {['Urgent', 'High'].includes(notice.priority) && (
                  <span className="notice__priority">{notice.priority}</span>
                )}
              </div>
              <div className="notice__date">
                {safeDate(notice.publishedAt, 'd MMMM yyyy')}
              </div>
              {notice.body && <p className="notice__body">{notice.body}</p>}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const forThisRole = (event, role) => {
  const audience = event.targetAudience?.length
    ? event.targetAudience
    : ['All'];
  return audience.includes('All') || audience.includes(role);
};

const coversDay = (event, day) => {
  const start = startOfDay(new Date(event.startDate));
  const end = startOfDay(new Date(event.endDate || event.startDate));
  const target = startOfDay(day);
  return target >= start && target <= end;
};

/**
 * This month, the days with something on, and what is coming up.
 *
 * Fetches for itself so every dashboard gets it from one line. The calendar is
 * a convenience on this screen: if it fails, the panel says there is nothing to
 * show rather than taking the dashboard down with it.
 */
export function MiniCalendar({ role }) {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let live = true;
    calendarService
      .getActive()
      .then((res) => {
        if (!live) return;
        const all = res.data.data?.calendar?.events || [];
        setEvents(all.filter((event) => forThisRole(event, role)));
      })
      .catch(() => {
        if (live) setEvents([]);
      });
    return () => {
      live = false;
    };
  }, [role]);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month)),
        end: endOfWeek(endOfMonth(month)),
      }),
    [month],
  );

  const today = new Date();
  const shown = useMemo(() => {
    if (selected) return events.filter((e) => coversDay(e, selected));

    const from = startOfDay(new Date());
    return events
      .filter((e) => new Date(e.endDate || e.startDate) >= from)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .slice(0, 4);
  }, [events, selected]);

  const moveMonth = (by) => {
    setMonth((current) => addMonths(current, by));
    setSelected(null);
  };

  return (
    <section className="card dash-card">
      <div className="card__header">
        <h2 className="card__title">Today, {format(today, 'd MMMM yyyy')}</h2>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => navigate(`${ROLE_HOME[role]}/calendar`)}
        >
          Calendar
        </button>
      </div>

      <div className="mini-calendar">
        <div className="mini-calendar__month">
          <div className="mini-calendar__nav">
            <button
              type="button"
              className="dash-round-btn"
              aria-label="Previous month"
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>{format(month, 'MMMM yyyy')}</span>
            <button
              type="button"
              className="dash-round-btn"
              aria-label="Next month"
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mini-calendar__grid">
            {WEEKDAYS.map((day, index) => (
              <span key={index} className="mini-calendar__weekday">
                {day}
              </span>
            ))}
            {days.map((day) => {
              const hasEvent = events.some((e) => coversDay(e, day));
              const classes = [
                'mini-calendar__day',
                !isSameMonth(day, month) && 'is-outside',
                isSameDay(day, today) && 'is-today',
                selected && isSameDay(day, selected) && 'is-selected',
                hasEvent && 'has-event',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  className={classes}
                  aria-label={`${format(day, 'd MMMM')}${hasEvent ? ', has events' : ''}`}
                  aria-pressed={Boolean(selected && isSameDay(day, selected))}
                  onClick={() =>
                    setSelected(
                      selected && isSameDay(day, selected) ? null : day,
                    )
                  }
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mini-calendar__events">
          <h3 className="mini-calendar__events-title">
            {selected ? format(selected, 'EEEE, d MMMM') : 'Coming up'}
          </h3>

          {shown.length === 0 ? (
            <div className="mini-calendar__empty">
              <CalendarDays size={22} />
              {selected ? 'Nothing on this day' : 'Nothing scheduled'}
            </div>
          ) : (
            <ul className="mini-calendar__list">
              {shown.map((event) => (
                <li key={event._id} className="mini-event">
                  <span className="mini-event__date">
                    <strong>{safeDate(event.startDate, 'd')}</strong>
                    {safeDate(event.startDate, 'MMM')}
                  </span>
                  <span className="mini-event__body">
                    <span className="mini-event__title">{event.title}</span>
                    <span className="mini-event__type">{event.type}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * One whole split into a few named parts.
 *
 * The values are always written out beside the ring. Two of the attendance
 * colours fall below 3:1 against the card, so the labels are what make the chart
 * readable rather than a nicety, and they are never tinted with the series colour.
 */
export function DonutCard({
  title,
  segments,
  centerValue,
  centerLabel,
  emptyText,
  footnote,
  formatValue = (value) => value.toLocaleString(),
}) {
  const parts = segments.filter((segment) => segment.value > 0);
  const total = parts.reduce((sum, segment) => sum + segment.value, 0);

  const data = {
    labels: parts.map((segment) => segment.label),
    datasets: [
      {
        data: parts.map((segment) => segment.value),
        backgroundColor: parts.map((segment) => segment.color),
        borderColor: '#ffffff',
        borderWidth: 2,
        borderRadius: 4,
        hoverOffset: 3,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) =>
            ` ${context.label}: ${formatValue(context.parsed)}`,
        },
      },
    },
  };

  return (
    <section className="card dash-card">
      <div className="card__header">
        <h2 className="card__title">{title}</h2>
      </div>
      <div className="card__body">
        {total === 0 ? (
          <div className="dash-empty">{emptyText}</div>
        ) : (
          <div className="donut">
            <div
              className="donut__ring"
              role="img"
              aria-label={`${title}: ${parts
                .map((p) => `${p.label} ${formatValue(p.value)}`)
                .join(', ')}`}
            >
              <Doughnut data={data} options={options} />
              {centerValue !== undefined && (
                <div className="donut__center">
                  <strong>{centerValue}</strong>
                  {centerLabel && <span>{centerLabel}</span>}
                </div>
              )}
            </div>
            <ul className="donut__legend">
              {segments.map((segment) => (
                <li key={segment.label}>
                  <span
                    className="donut__swatch"
                    style={{ background: segment.color }}
                  />
                  <span className="donut__label">{segment.label}</span>
                  <span className="donut__value">
                    {formatValue(segment.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {footnote && <p className="dash-footnote">{footnote}</p>}
      </div>
    </section>
  );
}

/**
 * One amount against a limit. A meter rather than a two-slice doughnut: there is
 * only one number to read, and a ring makes it harder to read, not easier.
 */
export function MeterCard({
  title,
  value,
  caption,
  percent,
  rows = [],
  emptyText,
  isEmpty = false,
  action,
}) {
  const filled = Math.max(0, Math.min(100, Number(percent) || 0));

  return (
    <section className="card dash-card">
      <div className="card__header">
        <h2 className="card__title">{title}</h2>
        {action}
      </div>
      <div className="card__body">
        {isEmpty ? (
          <div className="dash-empty">{emptyText}</div>
        ) : (
          <>
            <div className="meter__value">{value}</div>
            {caption && <div className="meter__caption">{caption}</div>}
            <div
              className="meter__track"
              role="progressbar"
              aria-label={title}
              aria-valuenow={filled}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="meter__fill" style={{ width: `${filled}%` }} />
            </div>
            <ul className="meter__rows">
              {rows.map((row) => (
                <li key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
