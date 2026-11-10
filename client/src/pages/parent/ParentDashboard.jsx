import { useEffect, useState } from 'react';
import { CalendarCheck, TrendingUp, Users, Wallet } from 'lucide-react';
import { dashboardService } from '../../services/api';
import ResultsLocked from '../../components/common/ResultsLocked';
import toast from 'react-hot-toast';
import {
  DashHeader,
  MiniCalendar,
  Noticeboard,
  QuickTiles,
  StatTile,
} from '../../components/dashboard/DashboardParts';

const TILES = [
  '/parent/payments',
  '/parent/results',
  '/parent/assignments',
  '/parent/timetable',
  '/parent/exam-schedules',
  '/parent/certificates',
];

const naira = (value) => `₦${Math.round(value || 0).toLocaleString()}`;

// What the fee itself owes, from everything received against it. This tile used
// to show the latest payment's status, so a ₦20,000 instalment on a ₦45,000 fee
// told the parent "Paid" with ₦25,000 still to go.
const feeTile = (feeBalance) => {
  if (!feeBalance) return { value: 'No fee', sub: 'None set this term' };
  if (feeBalance.outstanding > 0) {
    return {
      value: naira(feeBalance.outstanding),
      sub: `${feeBalance.status}: still owed`,
    };
  }
  return { value: 'Paid', sub: `${naira(feeBalance.totalAmount)} this term` };
};

function ChildCard({ entry }) {
  const {
    child,
    averageScore,
    attendance,
    latestResults,
    feeBalance,
    resultsLock,
  } = entry;
  const fee = feeTile(feeBalance);

  return (
    <section className="card dash-card child-card">
      <div className="card__header">
        <div className="child-card__who">
          <span className="child-card__avatar">
            {child.firstName[0]}
            {child.lastName[0]}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="child-card__name">
              {child.firstName} {child.lastName}
            </div>
            <div className="child-card__meta">
              {child.studentProfile?.class?.name} •{' '}
              {child.studentProfile?.admissionNumber}
            </div>
          </div>
        </div>
      </div>

      <div className="card__body">
        <div className="stat-tiles">
          <StatTile
            label="Average score"
            value={averageScore ? `${averageScore}%` : '—'}
            icon={TrendingUp}
            to="/parent/results"
          />
          <StatTile
            label="Attendance"
            value={`${attendance?.percentage || 0}%`}
            icon={CalendarCheck}
          />
          <StatTile
            label="Fees"
            value={fee.value}
            sub={fee.sub}
            icon={Wallet}
            to="/parent/payments"
          />
        </div>

        {/* This term held back over unpaid fees. Older, paid terms still
            show below. */}
        {resultsLock?.locked && (
          <div style={{ marginTop: 14 }}>
            <ResultsLocked compact lock={resultsLock} />
          </div>
        )}

        {latestResults?.length > 0 && (
          <>
            <h3 className="child-card__subjects-title">Recent subjects</h3>
            <div className="child-card__subjects">
              {latestResults.map((result) => (
                <div key={result._id} className="child-card__subject">
                  <span>{result.subject?.name}</span>
                  <strong>{result.totalScore}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function ParentDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardService
      // No term or year: the server resolves them from the school calendar.
      // A hard-coded 'First Term' here froze the dashboard on First Term.
      .getParent()
      .then((r) => setData(r.data.data))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" />
      </div>
    );

  const { childrenData = [], announcements = [] } = data || {};

  return (
    <>
      <DashHeader
        title="Parent Dashboard"
        subtitle="Monitor your children's academic progress"
      />

      <QuickTiles role="Parent" paths={TILES} />

      {childrenData.length === 0 ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="empty-state">
            <Users size={48} className="empty-state__icon" />
            <p className="empty-state__title">No children linked</p>
            <p className="empty-state__text">
              Contact admin to link your children&apos;s accounts
            </p>
          </div>
        </div>
      ) : (
        <div className="dash-row">
          {childrenData.map((entry) => (
            <ChildCard key={entry.child._id} entry={entry} />
          ))}
        </div>
      )}

      <div className="dash-main">
        <div className="dash-main__column">
          <Noticeboard announcements={announcements} role="Parent" />
        </div>
        <div className="dash-main__column">
          <MiniCalendar role="Parent" />
        </div>
      </div>
    </>
  );
}
