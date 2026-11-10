// ─── StudentDashboard.jsx ─────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Award, BookOpen, FileText, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dashboardService } from '../../services/api';
import ResultsLocked from '../../components/common/ResultsLocked';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { CA_MAX, caTotal } from '../../utils/scoreComponents';
import {
  DashHeader,
  DonutCard,
  MeterCard,
  MiniCalendar,
  Noticeboard,
  QuickTiles,
  StatTile,
} from '../../components/dashboard/DashboardParts';

const TILES = [
  '/student/results',
  '/student/assignments',
  '/student/payments',
  '/student/timetable',
  '/student/exam-schedules',
  '/student/library',
];

const naira = (value) => `₦${Math.round(value || 0).toLocaleString()}`;

export default function StudentDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    dashboardService
      // No term or year: the server resolves them from the school calendar.
      .getStudent()
      .then((r) => {
        setData(r.data.data);
      })

      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );

  const {
    student,
    stats = {},
    recentResults = [],
    pendingAssignments = [],
    announcements = [],
    feeBalance,
    resultsLock,
  } = data || {};
  const attendance = stats.attendance || {};
  const attendancePct = attendance.percentage || 0;

  return (
    <>
      <DashHeader
        title={`Welcome, ${student?.firstName || ''}!`}
        subtitle={[
          student?.studentProfile?.class?.name,
          student?.studentProfile?.admissionNumber,
        ]
          .filter(Boolean)
          .join(' • ')}
      />

      <QuickTiles role="Student" paths={TILES} />

      <div className="dash-main">
        <div className="dash-main__column">
          <Noticeboard announcements={announcements} role="Student" />
          <div className="stat-tiles">
            <StatTile
              label="Average score"
              value={stats.averageScore ? `${stats.averageScore}%` : '—'}
              icon={TrendingUp}
              to="/student/results"
            />
            <StatTile
              label="Attendance"
              value={`${attendancePct}%`}
              icon={Award}
            />
            <StatTile
              label="Subjects"
              value={stats.subjectCount || 0}
              icon={BookOpen}
            />
            <StatTile
              label="Pending tasks"
              value={stats.pendingAssignmentsCount || 0}
              icon={FileText}
              to="/student/assignments"
            />
          </div>
        </div>
        <div className="dash-main__column">
          <MiniCalendar role="Student" />
        </div>
      </div>

      <div className="dash-row">
        <DonutCard
          title="My attendance this term"
          centerValue={`${attendancePct}%`}
          centerLabel="attended"
          emptyText="No register has been marked for you this term"
          segments={[
            { label: 'Present', value: attendance.Present || 0, color: '#10B981' },
            { label: 'Late', value: attendance.Late || 0, color: '#F59E0B' },
            { label: 'Excused', value: attendance.Excused || 0, color: '#3B82F6' },
            { label: 'Absent', value: attendance.Absent || 0, color: '#EF4444' },
          ]}
        />

        <MeterCard
          title="My fees"
          isEmpty={!feeBalance}
          emptyText="No fee payments recorded yet"
          value={naira(feeBalance?.paidTotal)}
          caption={`paid of ${naira(feeBalance?.totalAmount)}, ${feeBalance?.feeStructure?.title || ''}`}
          percent={feeBalance?.percentPaid}
          rows={[
            { label: 'Status', value: feeBalance?.status },
            { label: 'Still owed', value: naira(feeBalance?.outstanding) },
          ]}
          action={
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => navigate('/student/payments')}
            >
              Open
            </button>
          }
        />

        <section className="card dash-card">
          <div className="card__header">
            <h2 className="card__title">Due assignments</h2>
          </div>
          <div className="card__body">
            {pendingAssignments.length === 0 ? (
              <div className="dash-empty">All caught up!</div>
            ) : (
              <ul className="due-list">
                {pendingAssignments.map((assignment) => (
                  <li key={assignment._id}>
                    <div className="due-list__title">{assignment.title}</div>
                    <div className="due-list__meta">
                      <span>{assignment.subject?.name}</span>
                      <span className="due-list__due">
                        Due {format(new Date(assignment.dueDate), 'dd MMM')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="card dash-card">
        <div className="card__header">
          <h2 className="card__title">Recent results</h2>
        </div>
        {resultsLock?.locked ? (
          // Held back over unpaid fees: say so, rather than "no results".
          <div className="card__body">
            <ResultsLocked compact lock={resultsLock} />
          </div>
        ) : recentResults.length === 0 ? (
          <div className="dash-empty">No published results yet</div>
        ) : (
          <div
            className="table-wrapper"
            style={{ border: 'none', borderRadius: 0 }}
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>CA Total /{CA_MAX}</th>
                  <th>Exam</th>
                  <th>Total</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {recentResults.map((result) => (
                  <tr key={result._id}>
                    <td style={{ fontWeight: 600 }}>{result.subject?.name}</td>
                    <td>{caTotal(result.scores)}</td>
                    <td>{result.scores?.exam || 0}</td>
                    <td
                      style={{
                        fontWeight: 700,
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      {result.totalScore}
                    </td>
                    <td>
                      {/* The server's grade. This page used to hold its own copy
                          of the ladder, which GRADE_SCALE exists to prevent. */}
                      <span className={`grade grade-${result.grade}`}>
                        {result.grade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
