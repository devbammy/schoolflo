import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Users,
  GraduationCap,
  Heart,
  School,
  BookOpen,
  ClipboardList,
  Bell,
  BookMarked,
  CheckSquare,
  CornerDownLeft,
} from 'lucide-react';
import { searchService } from '../../services/api';

// How each result group is labelled and iconed. The server decides which of
// these a given role can see; this map only knows how to draw them.
const GROUPS = {
  students: { label: 'Students', icon: Users },
  children: { label: 'My Children', icon: Users },
  teachers: { label: 'Teachers', icon: GraduationCap },
  parents: { label: 'Parents', icon: Heart },
  classes: { label: 'Classes', icon: School },
  subjects: { label: 'Subjects', icon: BookOpen },
  assignments: { label: 'Assignments', icon: ClipboardList },
  tasks: { label: 'Tasks', icon: CheckSquare },
  announcements: { label: 'Announcements', icon: Bell },
  books: { label: 'Library', icon: BookMarked },
};

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 250;

/**
 * Drop anything the portal has nowhere to open — a subject, say, has no page
 * of its own outside the admin panel. A row that does nothing when clicked is
 * worse than no row at all.
 */
const usableGroups = (groups = {}) =>
  Object.entries(groups).reduce((out, [group, items]) => {
    const openable = items.filter((item) => item.url);
    if (openable.length) out[group] = openable;
    return out;
  }, {});

export default function GlobalSearch() {
  const navigate = useNavigate();

  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState({});
  const [active, setActive] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  // Held so a slow response for an old query cannot overwrite a newer one.
  const requestRef = useRef(0);

  // A flat list in render order, which is what arrow keys actually move through.
  const flat = Object.entries(groups).flatMap(([group, items]) =>
    items.map((item) => ({ ...item, group })),
  );

  // ── Fetch, debounced ────────────────────────────────────────────────────
  useEffect(() => {
    const trimmed = term.trim();

    if (trimmed.length < MIN_LENGTH) {
      setGroups({});
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const requestId = ++requestRef.current;

    const timer = setTimeout(() => {
      searchService
        .query(trimmed)
        .then((res) => {
          // Ignore anything but the newest request in flight.
          if (requestId !== requestRef.current) return;
          setGroups(usableGroups(res.data?.data?.groups));
          setActive(0);
        })
        .catch(() => {
          if (requestId === requestRef.current) setGroups({});
        })
        .finally(() => {
          if (requestId === requestRef.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  // ── Close on an outside click ───────────────────────────────────────────
  useEffect(() => {
    if (!open) return undefined;

    const onClick = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };

    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // ── Ctrl/Cmd+K from anywhere ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const reset = useCallback(() => {
    setTerm('');
    setGroups({});
    setOpen(false);
  }, []);

  const go = useCallback(
    (result) => {
      if (!result?.url) return;
      navigate(result.url);
      reset();
      inputRef.current?.blur();
    },
    [navigate, reset],
  );

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      reset();
      inputRef.current?.blur();
      return;
    }

    if (!flat.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[active]);
    }
  };

  const showPanel = open && term.trim().length >= MIN_LENGTH;
  let cursor = -1; // running index, to line the rows up with `flat`

  return (
    <div className="global-search" ref={containerRef}>
      <div className="global-search__field">
        <Search size={16} className="global-search__icon" />
        <input
          ref={inputRef}
          type="text"
          className="global-search__input"
          placeholder="Search students, classes, tasks…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Search the portal"
        />
        {term ? (
          <button
            type="button"
            className="global-search__clear"
            onClick={reset}
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        ) : (
          <kbd className="global-search__kbd">Ctrl K</kbd>
        )}
      </div>

      {showPanel && (
        <div className="global-search__panel">
          {loading && !flat.length && (
            <div className="global-search__state">
              <div
                className="spinner"
                style={{ width: 18, height: 18, borderWidth: 2 }}
              />
              <span>Searching…</span>
            </div>
          )}

          {!loading && !flat.length && (
            <div className="global-search__state">
              <span>
                Nothing matches <strong>{term.trim()}</strong>
              </span>
            </div>
          )}

          {Object.entries(groups).map(([group, items]) => {
            const config = GROUPS[group] || { label: group, icon: Search };
            const Icon = config.icon;

            return (
              <div key={group} className="global-search__group">
                <div className="global-search__group-label">
                  <Icon size={12} />
                  {config.label}
                </div>

                {items.map((item) => {
                  cursor += 1;
                  const index = cursor;

                  return (
                    <button
                      key={`${group}-${item.id}`}
                      type="button"
                      className={`global-search__result${
                        index === active ? ' is-active' : ''
                      }`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(item)}
                    >
                      <div className="global-search__result-main">
                        <span className="global-search__result-title">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="global-search__result-subtitle">
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                      {item.meta && (
                        <span className="global-search__result-meta">
                          {item.meta}
                        </span>
                      )}
                      {index === active && (
                        <CornerDownLeft
                          size={13}
                          className="global-search__result-enter"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
