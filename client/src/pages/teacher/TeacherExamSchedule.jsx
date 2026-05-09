import React, { useEffect, useState } from 'react';
import { examScheduleService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import {
  Calendar,
  Clock,
  MapPin,
  BookOpen,
  GraduationCap,
  ClipboardList,
} from 'lucide-react';
import { format } from 'date-fns';

const TERMS = ['First Term', 'Second Term', 'Third Term'];

export default function TeacherExamSchedule() {
  const { user } = useAuthStore();
  const [invigilations, setInvigilations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('First Term');
  const currentYear = new Date().getFullYear();
  const [academicYear, setAcademicYear] = useState(
    `${currentYear - 1}/${currentYear}`,
  );

  useEffect(() => {
    setLoading(true);
    examScheduleService
      .getTeacherInvigilations({ term, academicYear })
      .then((r) =>
        setInvigilations(r.data.data?.schedules || r.data.data || []),
      )
      .catch(() => toast.error('Failed to load schedules'))
      .finally(() => setLoading(false));
  }, [term, academicYear]);

  const invigilationsByDate = invigilations.reduce((acc, schedule) => {
    schedule.sessions?.forEach((session) => {
      const dateKey = new Date(session.date).toDateString();
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push({ ...session, className: schedule.class?.name });
    });
    return acc;
  }, {});

  const sortedDates = Object.keys(invigilationsByDate).sort(
    (a, b) => new Date(a) - new Date(b),
  );

  return (
    <div className="teacher-schedule">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Invigilation Schedule</h1>
          <p className="page-header__subtitle">
            Manage your examination duties and classroom assignments
          </p>
        </div>
      </div>

      <div className="controls-bar">
        {TERMS.map((t) => (
          <button
            key={t}
            className={`btn btn--sm ${term === t ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setTerm(t)}
          >
            {t}
          </button>
        ))}
        <input
          className="form-control"
          style={{ width: 140 }}
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          placeholder="Year"
        />
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner" />
        </div>
      ) : invigilations.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <ClipboardList size={44} className="empty-state__icon" />
            <p className="empty-state__title">No Duties Assigned</p>
            <p className="empty-state__text">
              You have no invigilation assignments for this term.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          {sortedDates.map((dateStr) => (
            <div key={dateStr} className="date-group-card">
              <div className="date-header">
                <Calendar size={18} />
                <h2>{format(new Date(dateStr), 'EEEE, dd MMMM yyyy')}</h2>
              </div>

              <div className="sessions-list">
                {invigilationsByDate[dateStr].map((session, idx) => (
                  <div key={idx} className="session-item">
                    <div className="session-grid">
                      <div>
                        <p className="field-label">Subject</p>
                        <p className="field-value">
                          <BookOpen size={16} /> {session.subject?.name}
                        </p>
                        <span className="text-sm text-muted">
                          {session.subject?.code}
                        </span>
                      </div>

                      <div>
                        <p className="field-label">Class</p>
                        <p className="field-value">
                          <GraduationCap size={16} /> {session.className}
                        </p>
                      </div>

                      <div>
                        <p className="field-label">Time & Duration</p>
                        <p className="field-value">
                          <Clock size={16} /> {session.startTime} -{' '}
                          {session.endTime}
                        </p>
                        <span className="text-sm text-muted">
                          {session.duration} mins
                        </span>
                      </div>

                      <div>
                        <p className="field-label">Venue</p>
                        <p className="field-value">
                          <MapPin size={16} /> {session.venue}
                        </p>
                      </div>
                    </div>

                    {session.instructions && (
                      <div className="session-footer">
                        <p className="field-label">Assignment Notes</p>
                        <div className="instruction-note">
                          {session.instructions}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
