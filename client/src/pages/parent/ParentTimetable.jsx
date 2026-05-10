import React, { useEffect, useState } from 'react';
import { timetableService } from '../../services/api';
import TimetableView from '../../components/common/TimetableView';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { Users } from 'lucide-react';
import {
  getCurrentAcademicYear,
  generateAcademicYearOptions,
} from '../../utils/academicYear';

const TERMS = ['First Term', 'Second Term', 'Third Term'];

export default function ParentTimetable() {
  const { user } = useAuthStore();
  const [timetables, setTimetables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('First Term');
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());

  // normalise children — only populated objects
  const children = (user?.parentProfile?.children || []).filter(
    (c) => c && typeof c === 'object' && c._id,
  );

  useEffect(() => {
    setLoading(true);
    timetableService
      .getMine({ term, academicYear })
      .then((r) => setTimetables(r.data.data?.timetables || []))
      .catch(() => toast.error('Failed to load timetable'))
      .finally(() => setLoading(false));
  }, [term, academicYear]);

  if (children.length === 0) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-header__title">Children's Timetables</h1>
          </div>
        </div>
        <div className="card">
          <div className="empty-state" style={{ padding: '60px 24px' }}>
            <Users size={44} className="empty-state__icon" />
            <p className="empty-state__title">No children linked</p>
            <p className="empty-state__text">
              Contact the school admin to link your children's accounts.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Children's Timetables</h1>
          <p className="page-header__subtitle">
            Weekly class schedules for your children
          </p>
        </div>
      </div>

      {/* Term selector */}
      <div
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}
      >
        {TERMS.map((t) => (
          <button
            key={t}
            className={`btn btn--${term === t ? 'primary' : 'secondary'} btn--sm`}
            onClick={() => setTerm(t)}
          >
            {t}
          </button>
        ))}
        <select
          className="form-control"
          style={{ width: 130 }}
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
        >
          {generateAcademicYearOptions(5).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" />
        </div>
      ) : (
        /* TimetableView handles the class-switcher when timetables.length > 1 */
        <TimetableView
          timetables={timetables}
          title="Class Schedule"
          defaultView="day"
          showDayNav
        />
      )}
    </>
  );
}
