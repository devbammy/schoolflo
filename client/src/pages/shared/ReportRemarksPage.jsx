import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { classService, reportRemarkService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import {
  generateAcademicYearOptions,
  getCurrentAcademicYear,
} from '../../utils/academicYear';

/**
 * Behaviour ratings and the teacher's comment for each student's report card,
 * entered by the class's form teacher (or an admin).
 *
 * One row per student. The seven traits and five ratings come from the server
 * (they are the school's printed card), and only rows that were changed are
 * sent, so two people working on different students cannot overwrite each
 * other. Once the class's results for the term are published the page is
 * read-only for teachers, as scores are.
 */

const TERMS = ['First Term', 'Second Term', 'Third Term'];

// Short labels for the column heads, so seven columns fit beside a name.
const TRAIT_LABELS = {
  punctuality: 'Punctuality',
  attentiveness: 'Attentiveness',
  timeManagement: 'Time Mgt.',
  creativity: 'Creativity',
  teamWork: 'Team Work',
  neatness: 'Neatness',
  sport: 'Sport',
};

export default function ReportRemarksPage() {
  const user = useAuthStore((s) => s.user);
  const [classes, setClasses] = useState([]);
  const [filters, setFilters] = useState({
    class: '',
    section: '',
    term: 'First Term',
    academicYear: getCurrentAcademicYear(),
  });
  const [data, setData] = useState(null);
  const [rows, setRows] = useState({});
  const [dirty, setDirty] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // A teacher sees the classes they are form teacher of (the whole class, or
  // an arm of it); an admin sees every class. The server enforces this anyway.
  useEffect(() => {
    classService.getAll().then((res) => {
      const all = res.data.data.classes || [];
      const mine =
        user?.role === 'Admin'
          ? all
          : all.filter(
              (c) =>
                String(c._id) ===
                  String(
                    user?.teacherProfile?.classTeacherOf?._id ||
                      user?.teacherProfile?.classTeacherOf,
                  ) ||
                (c.sections || []).some(
                  (s) =>
                    String(s.classTeacher?._id || s.classTeacher) ===
                    String(user?._id),
                ),
            );
      setClasses(mine);
      if (mine.length === 1) {
        setFilters((f) => ({ ...f, class: mine[0]._id }));
      }
    });
  }, [user]);

  const sections = useMemo(
    () => classes.find((c) => c._id === filters.class)?.sections || [],
    [classes, filters.class],
  );

  const load = useCallback(async () => {
    if (!filters.class) return;
    setLoading(true);
    try {
      const res = await reportRemarkService.getForClass({
        class: filters.class,
        term: filters.term,
        academicYear: filters.academicYear,
        section: filters.section || undefined,
      });
      const payload = res.data.data;
      setData(payload);
      setRows(
        Object.fromEntries(
          payload.students.map((s) => [
            s._id,
            { behaviour: { ...s.behaviour }, teacherComment: s.teacherComment },
          ]),
        ),
      );
      setDirty(new Set());
    } catch (err) {
      setData(null);
      toast.error(err.response?.data?.message || 'Could not load the class');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const setTrait = (id, trait, value) => {
    setRows((r) => ({
      ...r,
      [id]: { ...r[id], behaviour: { ...r[id].behaviour, [trait]: value } },
    }));
    setDirty((d) => new Set(d).add(id));
  };

  const setComment = (id, value) => {
    setRows((r) => ({ ...r, [id]: { ...r[id], teacherComment: value } }));
    setDirty((d) => new Set(d).add(id));
  };

  const save = async () => {
    if (!dirty.size) return;
    setSaving(true);
    try {
      const remarks = [...dirty].map((id) => ({
        student: id,
        behaviour: Object.fromEntries(
          data.traits.map((t) => [t, rows[id].behaviour?.[t] || '']),
        ),
        teacherComment: rows[id].teacherComment || '',
      }));
      const res = await reportRemarkService.save({
        class: filters.class,
        term: filters.term,
        academicYear: filters.academicYear,
        remarks,
      });
      toast.success(res.data.message);
      setDirty(new Set());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const locked = Boolean(data?.locked);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Behaviour &amp; Comments</h1>
          <p className="page-header__subtitle">
            The behaviour ratings and teacher&apos;s comment printed on each
            student&apos;s report card
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn--primary"
            onClick={save}
            disabled={locked || saving || dirty.size === 0}
          >
            <Save size={16} />
            {saving
              ? 'Saving…'
              : dirty.size
                ? `Save ${dirty.size} student${dirty.size === 1 ? '' : 's'}`
                : 'Saved'}
          </button>
        </div>
      </div>

      <div className="list-toolbar">
        <select
          className="form-control"
          style={{ width: 'auto', minWidth: 180 }}
          value={filters.class}
          onChange={(e) =>
            setFilters((f) => ({ ...f, class: e.target.value, section: '' }))
          }
          aria-label="Class"
        >
          <option value="">
            {classes.length ? 'Select class' : 'You are not a form teacher'}
          </option>
          {classes.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
        {sections.length > 0 && (
          <select
            className="form-control"
            style={{ width: 'auto', minWidth: 140 }}
            value={filters.section}
            onChange={(e) =>
              setFilters((f) => ({ ...f, section: e.target.value }))
            }
            aria-label="Section"
          >
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.name} value={s.name}>
                Section {s.name}
              </option>
            ))}
          </select>
        )}
        <select
          className="form-control"
          style={{ width: 'auto' }}
          value={filters.term}
          onChange={(e) => setFilters((f) => ({ ...f, term: e.target.value }))}
          aria-label="Term"
        >
          {TERMS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          className="form-control"
          style={{ width: 'auto' }}
          value={filters.academicYear}
          onChange={(e) =>
            setFilters((f) => ({ ...f, academicYear: e.target.value }))
          }
          aria-label="Session"
        >
          {generateAcademicYearOptions({ count: 4 }).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </div>

      {locked && (
        <div
          className="card"
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: '0.875rem',
          }}
        >
          <Lock
            size={16}
            style={{ color: 'var(--clr-warning)', flexShrink: 0 }}
          />
          <span style={{ minWidth: 0 }}>
            Results for this class and term are published, so these are locked.
            Ask an administrator to correct anything.
          </span>
        </div>
      )}

      <div className="card">
        <div
          className="table-wrapper"
          style={{ border: 'none', borderRadius: 0 }}
        >
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                {(data?.traits || Object.keys(TRAIT_LABELS)).map((t) => (
                  <th key={t} style={{ whiteSpace: 'nowrap' }}>
                    {TRAIT_LABELS[t] || t}
                  </th>
                ))}
                <th style={{ minWidth: 220 }}>Teacher&apos;s comment</th>
              </tr>
            </thead>
            <tbody>
              {!filters.class ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 32 }}>
                    Choose a class to begin.
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 32 }}>
                    <span className="spinner" />
                  </td>
                </tr>
              ) : !data?.students?.length ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      textAlign: 'center',
                      padding: 32,
                      color: 'var(--clr-text-3)',
                    }}
                  >
                    No students in this class.
                  </td>
                </tr>
              ) : (
                data.students.map((s) => (
                  <tr key={s._id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>
                        {s.firstName} {s.lastName}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--clr-text-3)',
                        }}
                      >
                        {s.admissionNumber}
                        {s.section ? ` · ${s.section}` : ''}
                      </div>
                    </td>
                    {data.traits.map((t) => (
                      <td key={t}>
                        <select
                          className="form-control"
                          style={{ minWidth: 112, padding: '6px 8px' }}
                          value={rows[s._id]?.behaviour?.[t] || ''}
                          onChange={(e) => setTrait(s._id, t, e.target.value)}
                          disabled={locked}
                          aria-label={`${TRAIT_LABELS[t]} for ${s.firstName}`}
                        >
                          <option value="">—</option>
                          {data.ratings.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                    ))}
                    <td>
                      <input
                        className="form-control"
                        maxLength={300}
                        value={rows[s._id]?.teacherComment || ''}
                        onChange={(e) => setComment(s._id, e.target.value)}
                        disabled={locked}
                        placeholder="e.g. Well behaved. Keep it up"
                        aria-label={`Comment for ${s.firstName}`}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
