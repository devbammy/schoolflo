import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronRight } from 'lucide-react';
import { timetableService } from '../../services/api';
import TimetableView from './TimetableView';

/**
 * Compact timetable card for embedding in any role dashboard.
 * Loads /timetables/mine automatically.
 *
 * Props:
 *   navigateTo   – route to navigate on "View full timetable" click
 *   term         – e.g. 'First Term'
 *   academicYear – e.g. '2024/2025'
 *   teacherId    – pass teacher's _id to highlight their periods (teacher dashboard)
 */
export default function TimetableWidget({
  navigateTo,
  term = 'First Term',
  academicYear = '2024/2025',
  teacherId = null,
}) {
  const navigate = useNavigate();
  const [timetables, setTimetables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    timetableService
      .getMine({ term, academicYear })
      .then((r) => setTimetables(r.data.data?.timetables || []))
      .catch(() => {
        /* silent — widget is secondary */
      })
      .finally(() => setLoading(false));
  }, [term, academicYear]);

  if (loading) {
    return (
      <div className="card">
        <div className="card__header">
          <span
            className="card__title"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Calendar size={15} /> Today's Schedule
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <div
            className="spinner"
            style={{ width: 24, height: 24, borderWidth: 2 }}
          />
        </div>
      </div>
    );
  }

  if (!timetables.length) {
    return (
      <div className="card">
        <div className="card__header">
          <span
            className="card__title"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Calendar size={15} /> Today's Schedule
          </span>
        </div>
        <div
          style={{
            padding: '20px 16px',
            textAlign: 'center',
            color: 'var(--clr-text-3)',
            fontSize: '0.875rem',
          }}
        >
          No timetable published yet
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Compact day-view card */}
      <TimetableView
        timetables={timetables}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={15} /> Today's Schedule
          </span>
        }
        compact
        defaultView="day"
        showDayNav={false}
        highlightTeacherId={teacherId}
      />

      {/* Link to full page */}
      {navigateTo && (
        <div style={{ marginTop: 6, textAlign: 'right' }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => navigate(navigateTo)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.8125rem',
            }}
          >
            View full timetable <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
