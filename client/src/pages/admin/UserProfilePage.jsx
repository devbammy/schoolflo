import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  User as UserIcon,
  BookOpen,
  GraduationCap,
  Users,
  Wallet,
  ClipboardCheck,
  Library as LibraryIcon,
  CheckSquare,
  Clock,
  Edit2,
} from 'lucide-react';
import { format } from 'date-fns';
import { userService } from '../../services/api';
import toast from 'react-hot-toast';

// ── Shared bits ──────────────────────────────────────────────────────────────
const fmtDate = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—');
const money = (n) => `₦${(Number(n) || 0).toLocaleString()}`;

const FEE_TONE = {
  cleared: 'success',
  partial: 'warning',
  overdue: 'danger',
  owing: 'danger',
  none: 'neutral',
};

const ROLE_ACCENT = {
  Student: { bg: '#dbeafe', color: '#1e40af' },
  Teacher: { bg: '#e0f2fe', color: '#0369a1' },
  Parent: { bg: '#d1fae5', color: '#065f46' },
  Admin: { bg: '#ede9fe', color: '#5b21b6' },
};

function Avatar({ user, size = 72 }) {
  const accent = ROLE_ACCENT[user?.role] || ROLE_ACCENT.Student;
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: user?.avatar?.url ? 'transparent' : accent.bg,
        color: accent.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.36,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {user?.avatar?.url ? (
        <img
          src={user.avatar.url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children, action }) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card__header">
        <h3
          className="card__title"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {Icon && <Icon size={16} />} {title}
        </h3>
        {action}
      </div>
      <div className="card__body">{children}</div>
    </div>
  );
}

function InfoGrid({ items }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
      }}
    >
      {items
        .filter((it) => it)
        .map((it) => (
          <div key={it.label}>
            <div
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--clr-text-3)',
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {it.label}
            </div>
            <div style={{ fontSize: '0.9375rem', color: 'var(--clr-text-1)' }}>
              {it.value ?? '—'}
            </div>
          </div>
        ))}
    </div>
  );
}

function StatTiles({ tiles }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 12,
      }}
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          style={{
            border: '1px solid var(--clr-border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            background: 'var(--clr-bg)',
          }}
        >
          <div
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: t.color || 'var(--clr-text-1)',
            }}
          >
            {t.value}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--clr-text-3)' }}>
            {t.label}
          </div>
        </div>
      ))}
    </div>
  );
}

const EmptyRow = ({ children }) => (
  <p
    style={{
      color: 'var(--clr-text-3)',
      fontSize: '0.875rem',
      padding: '8px 0',
    }}
  >
    {children}
  </p>
);

// ── Page ─────────────────────────────────────────────────────────────────────
export default function UserProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await userService.getProfile(id);
      setData(res.data.data);
    } catch (err) {
      setError(true);
      toast.error(err.response?.data?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: 'var(--clr-text-3)', marginBottom: 16 }}>
          Could not load this profile.
        </p>
        <button className="btn btn--secondary" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} /> Go back
        </button>
      </div>
    );
  }

  const { user, related } = data;
  const sp = user.studentProfile || {};
  const tp = user.teacherProfile || {};
  const pp = user.parentProfile || {};
  const backTo =
    user.role === 'Teacher'
      ? '/admin/teachers'
      : user.role === 'Parent'
        ? '/admin/parents'
        : '/admin/students';

  return (
    <>
      <button
        className="btn btn--ghost btn--sm"
        style={{ marginBottom: 16, gap: 6 }}
        onClick={() => navigate(backTo)}
      >
        <ArrowLeft size={15} /> Back to {user.role}s
      </button>

      {/* Identity header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div
          className="card__body"
          style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}
        >
          <Avatar user={user} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {user.firstName} {user.lastName}
              </h1>
              <span className="badge badge--info">{user.role}</span>
              <span
                className={`badge badge--${user.isActive ? 'success' : 'danger'}`}
              >
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 18,
                flexWrap: 'wrap',
                marginTop: 10,
                fontSize: '0.875rem',
                color: 'var(--clr-text-2)',
              }}
            >
              <span
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Mail size={14} /> {user.email}
              </span>
              {user.phone && (
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Phone size={14} /> {user.phone}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} /> Joined {fmtDate(user.createdAt)}
              </span>
              {user.lastLogin && (
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Clock size={14} /> Last seen {fmtDate(user.lastLogin)}
                </span>
              )}
            </div>
          </div>
          <button
            className="btn btn--secondary btn--sm"
            style={{ alignSelf: 'flex-start', gap: 6 }}
            onClick={() => navigate(backTo)}
            title="Edit is available from the list page"
          >
            <Edit2 size={14} /> Manage
          </button>
        </div>
      </div>

      {/* ── STUDENT ──────────────────────────────────────────────────────── */}
      {user.role === 'Student' && (
        <>
          <Section title="Student Details" icon={UserIcon}>
            <InfoGrid
              items={[
                { label: 'Admission No.', value: sp.admissionNumber },
                { label: 'Class', value: sp.class?.name },
                { label: 'Section', value: sp.section },
                { label: 'Gender', value: sp.gender },
                { label: 'Date of Birth', value: fmtDate(sp.dateOfBirth) },
                { label: 'Blood Group', value: sp.bloodGroup },
                {
                  label: 'Admission Date',
                  value: fmtDate(sp.admissionDate),
                },
                { label: 'Status', value: sp.profileStatus },
                sp.address && {
                  label: 'Address',
                  value: (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <MapPin size={13} /> {sp.address}
                    </span>
                  ),
                },
                sp.medicalNotes && {
                  label: 'Medical Notes',
                  value: sp.medicalNotes,
                },
              ]}
            />
          </Section>

          <Section title="Parent / Guardian" icon={Users}>
            {sp.parentId ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <Avatar user={sp.parentId} size={44} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600 }}>
                    {sp.parentId.firstName} {sp.parentId.lastName}
                    <span
                      className="badge badge--neutral"
                      style={{ marginLeft: 8 }}
                    >
                      {sp.parentId.parentProfile?.relationship || 'Guardian'}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--clr-text-3)',
                    }}
                  >
                    {sp.parentId.email}
                    {sp.parentId.phone ? ` • ${sp.parentId.phone}` : ''}
                  </div>
                </div>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => navigate(`/admin/users/${sp.parentId._id}`)}
                >
                  View parent
                </button>
              </div>
            ) : (
              <EmptyRow>No parent account linked.</EmptyRow>
            )}

            {related.siblings?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--clr-text-3)',
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  Siblings
                </div>
                <div
                  style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
                >
                  {related.siblings.map((sib) => (
                    <button
                      key={sib._id}
                      onClick={() => navigate(`/admin/users/${sib._id}`)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px',
                        border: '1px solid var(--clr-border)',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--clr-bg)',
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <Avatar user={sib} size={22} />
                      {sib.firstName} {sib.lastName}
                      <span style={{ color: 'var(--clr-text-3)' }}>
                        {sib.studentProfile?.class?.name || ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section
            title={`Fees — ${related.period?.term} ${related.period?.academicYear}`}
            icon={Wallet}
          >
            {related.fees?.currentTerm ? (
              <>
                <StatTiles
                  tiles={[
                    {
                      label: 'Term fee',
                      value: money(related.fees.currentTerm.totalAmount),
                    },
                    {
                      label: 'Paid',
                      value: money(related.fees.currentTerm.paid),
                      color: 'var(--clr-success)',
                    },
                    {
                      label: 'Balance',
                      value: money(related.fees.currentTerm.balance),
                      color:
                        related.fees.currentTerm.balance > 0
                          ? 'var(--clr-danger)'
                          : 'var(--clr-text-1)',
                    },
                    {
                      label: 'Paid all-time',
                      value: money(related.fees.totalPaidAllTime),
                    },
                  ]}
                />
                <div style={{ marginTop: 10 }}>
                  <span
                    className={`badge badge--${
                      FEE_TONE[related.fees.currentTerm.status] || 'neutral'
                    }`}
                  >
                    {related.fees.currentTerm.status}
                  </span>
                  {related.fees.currentTerm.dueDate && (
                    <span
                      style={{
                        marginLeft: 10,
                        fontSize: '0.8125rem',
                        color: 'var(--clr-text-3)',
                      }}
                    >
                      Due {fmtDate(related.fees.currentTerm.dueDate)}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <EmptyRow>
                No fee structure set for this student&apos;s class this term.
              </EmptyRow>
            )}

            {related.fees?.payments?.length > 0 && (
              <div className="table-wrapper" style={{ marginTop: 16 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Fee</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {related.fees.payments.map((p) => (
                      <tr key={p._id}>
                        <td>{fmtDate(p.paymentDate || p.createdAt)}</td>
                        <td>
                          {p.feeStructure?.title ||
                            `${p.term || ''} ${p.academicYear || ''}`}
                        </td>
                        <td>{money(p.amountPaid)}</td>
                        <td style={{ textTransform: 'capitalize' }}>
                          {p.gateway || '—'}
                        </td>
                        <td>
                          <span className="badge badge--neutral">
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title={`Attendance — ${related.period?.term}`}
            icon={ClipboardCheck}
          >
            {related.attendance?.total > 0 ? (
              <StatTiles
                tiles={[
                  {
                    label: 'Present',
                    value: related.attendance.Present,
                    color: 'var(--clr-success)',
                  },
                  { label: 'Late', value: related.attendance.Late },
                  {
                    label: 'Absent',
                    value: related.attendance.Absent,
                    color: 'var(--clr-danger)',
                  },
                  { label: 'Excused', value: related.attendance.Excused },
                  {
                    label: 'Rate',
                    value: `${related.attendance.percentage}%`,
                  },
                ]}
              />
            ) : (
              <EmptyRow>No attendance recorded this term.</EmptyRow>
            )}
          </Section>

          <Section title="Results History" icon={GraduationCap}>
            {related.results?.length > 0 ? (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Session / Term</th>
                      <th>Subject</th>
                      <th>Total</th>
                      <th>Grade</th>
                      <th>Position</th>
                      <th>Published</th>
                    </tr>
                  </thead>
                  <tbody>
                    {related.results.map((r) => (
                      <tr key={r._id}>
                        <td style={{ fontSize: '0.8125rem' }}>
                          {r.academicYear} · {r.term}
                        </td>
                        <td>{r.subject?.name || '—'}</td>
                        <td>{r.totalScore}</td>
                        <td>
                          <span className="badge badge--neutral">
                            {r.grade || '—'}
                          </span>
                        </td>
                        <td>{r.position || '—'}</td>
                        <td>
                          <span
                            className={`badge badge--${
                              r.isPublished ? 'success' : 'warning'
                            }`}
                          >
                            {r.isPublished ? 'Yes' : 'Draft'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyRow>No results recorded yet.</EmptyRow>
            )}
          </Section>

          <Section title="Library Records" icon={LibraryIcon}>
            {related.library?.length > 0 ? (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th>Borrowed</th>
                      <th>Due</th>
                      <th>Returned</th>
                      <th>Status</th>
                      <th>Fine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {related.library.map((b) => (
                      <tr key={b._id}>
                        <td>{b.book?.title || '—'}</td>
                        <td>{fmtDate(b.issueDate)}</td>
                        <td>{fmtDate(b.dueDate)}</td>
                        <td>{b.returnDate ? fmtDate(b.returnDate) : '—'}</td>
                        <td>
                          <span
                            className={`badge badge--${
                              b.status === 'Returned'
                                ? 'success'
                                : b.status === 'Borrowed'
                                  ? 'info'
                                  : 'danger'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td>
                          {b.fine?.amount
                            ? `${money(b.fine.amount)}${
                                b.fine.paid ? ' (paid)' : ''
                              }`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyRow>No borrow history.</EmptyRow>
            )}
          </Section>
        </>
      )}

      {/* ── TEACHER ──────────────────────────────────────────────────────── */}
      {user.role === 'Teacher' && (
        <>
          <Section title="Staff Details" icon={UserIcon}>
            <InfoGrid
              items={[
                { label: 'Staff ID', value: tp.staffId },
                { label: 'Designation', value: tp.designation },
                { label: 'Qualification', value: tp.qualification },
                { label: 'Specialization', value: tp.specialization },
                {
                  label: 'Experience',
                  value:
                    tp.experience != null ? `${tp.experience} yrs` : null,
                },
                { label: 'Join Date', value: fmtDate(tp.joinDate) },
                {
                  label: 'Class Teacher Of',
                  value: tp.classTeacherOf?.name,
                },
              ]}
            />
          </Section>

          <Section title="Subjects Taught" icon={BookOpen}>
            {tp.subjectsTaught?.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tp.subjectsTaught.map((s) => (
                  <span key={s._id} className="badge badge--neutral">
                    {s.name}
                    {s.code ? ` (${s.code})` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <EmptyRow>No subjects assigned.</EmptyRow>
            )}
            {related.classesTeaching?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--clr-text-3)',
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  Class teacher for
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {related.classesTeaching.map((c) => (
                    <span key={c._id} className="badge badge--info">
                      {c.name}
                      {c.sections?.length ? ` — ${c.sections.join(', ')}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section title="Attendance — Last 30 Days" icon={ClipboardCheck}>
            {related.staffAttendance?.summaryLast30Days?.total > 0 ? (
              <StatTiles
                tiles={[
                  {
                    label: 'Days recorded',
                    value: related.staffAttendance.summaryLast30Days.total,
                  },
                  {
                    label: 'Attended',
                    value: related.staffAttendance.summaryLast30Days.attended,
                    color: 'var(--clr-success)',
                  },
                  {
                    label: 'Rate',
                    value: `${related.staffAttendance.summaryLast30Days.attendanceRate}%`,
                  },
                  {
                    label: 'Avg worked',
                    value: `${Math.round(
                      (related.staffAttendance.summaryLast30Days
                        .averageWorkedMinutes || 0) / 6,
                    ) / 10}h`,
                  },
                  {
                    label: 'Late minutes',
                    value:
                      related.staffAttendance.summaryLast30Days
                        .totalLateMinutes || 0,
                  },
                ]}
              />
            ) : (
              <EmptyRow>No clock-in records in the last 30 days.</EmptyRow>
            )}
            {related.staffAttendance?.recent?.length > 0 && (
              <div className="table-wrapper" style={{ marginTop: 16 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Clock In</th>
                      <th>Clock Out</th>
                      <th>Worked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {related.staffAttendance.recent.map((a) => (
                      <tr key={a._id}>
                        <td>{fmtDate(a.date)}</td>
                        <td>
                          <span className="badge badge--neutral">
                            {a.status}
                          </span>
                        </td>
                        <td>
                          {a.clockIn?.at
                            ? format(new Date(a.clockIn.at), 'HH:mm')
                            : '—'}
                        </td>
                        <td>
                          {a.clockOut?.at
                            ? format(new Date(a.clockOut.at), 'HH:mm')
                            : '—'}
                        </td>
                        <td>
                          {a.workedMinutes
                            ? `${Math.floor(a.workedMinutes / 60)}h ${
                                a.workedMinutes % 60
                              }m`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Assigned Tasks" icon={CheckSquare}>
            {related.tasks?.stats?.total > 0 ? (
              <>
                <StatTiles
                  tiles={[
                    { label: 'Total', value: related.tasks.stats.total },
                    {
                      label: 'Overdue',
                      value: related.tasks.stats.overdue,
                      color: 'var(--clr-danger)',
                    },
                  ]}
                />
                {related.tasks.recent?.length > 0 && (
                  <div className="table-wrapper" style={{ marginTop: 16 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Due</th>
                          <th>Priority</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {related.tasks.recent.map((t) => (
                          <tr key={t._id}>
                            <td>{t.title}</td>
                            <td>{fmtDate(t.dueDate)}</td>
                            <td style={{ textTransform: 'capitalize' }}>
                              {t.priority || '—'}
                            </td>
                            <td>
                              <span className="badge badge--neutral">
                                {t.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <EmptyRow>No tasks assigned.</EmptyRow>
            )}
          </Section>
        </>
      )}

      {/* ── PARENT ───────────────────────────────────────────────────────── */}
      {user.role === 'Parent' && (
        <>
          <Section title="Parent Details" icon={UserIcon}>
            <InfoGrid
              items={[
                { label: 'Relationship', value: pp.relationship },
                { label: 'Occupation', value: pp.occupation },
                {
                  label: 'Children Linked',
                  value: related.children?.length ?? 0,
                },
              ]}
            />
          </Section>

          <Section
            title={`Linked Children (${related.children?.length || 0})`}
            icon={Users}
          >
            {related.children?.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {related.children.map((child) => (
                  <div
                    key={child._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      border: '1px solid var(--clr-border)',
                      borderRadius: 'var(--radius-md)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <Avatar user={child} size={40} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 600 }}>
                        {child.firstName} {child.lastName}
                      </div>
                      <div
                        style={{
                          fontSize: '0.8125rem',
                          color: 'var(--clr-text-3)',
                        }}
                      >
                        {child.studentProfile?.class?.name || 'No class'} ·{' '}
                        {child.studentProfile?.admissionNumber || '—'}
                      </div>
                    </div>
                    {child.attendance?.total > 0 && (
                      <span
                        className="badge badge--neutral"
                        title="Attendance rate this term"
                      >
                        {child.attendance.percentage}% present
                      </span>
                    )}
                    <span
                      className={`badge badge--${
                        child.isActive ? 'success' : 'danger'
                      }`}
                    >
                      {child.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => navigate(`/admin/users/${child._id}`)}
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRow>
                No children linked. Use “Manage Children” on the Parents page.
              </EmptyRow>
            )}
          </Section>
        </>
      )}
    </>
  );
}
