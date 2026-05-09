import React, { useEffect, useState } from 'react';
import { timetableService } from '../../services/api';
import TimetableView from '../../components/common/TimetableView';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const TERMS = ['First Term', 'Second Term', 'Third Term'];

export default function TeacherTimetable() {
  const { user } = useAuthStore();
  const [timetables, setTimetables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('First Term');
  const currentYear = new Date().getFullYear();
  const [academicYear, setAcademicYear] = useState(
    `${currentYear - 1}/${currentYear}`,
  );

  useEffect(() => {
    setLoading(true);
    timetableService
      .getMine({ term, academicYear })
      .then((r) => {
        setTimetables(r.data.data?.timetables || []);
      })
      .catch((err) => {
        toast.error('Failed to load timetable');
      })
      .finally(() => setLoading(false));
  }, [term, academicYear]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">My Timetable</h1>
          <p className="page-header__subtitle">
            Classes where you appear as the assigned teacher
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
        <input
          className="form-control"
          style={{ width: 130 }}
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          placeholder="2024/2025"
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" />
        </div>
      ) : (
        <TimetableView
          timetables={timetables}
          title="Teaching Schedule"
          defaultView="week"
          showDayNav
          highlightTeacherId={String(user?._id)}
        />
      )}
    </>
  );
}
