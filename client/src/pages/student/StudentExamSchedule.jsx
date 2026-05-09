import React, { useEffect, useState } from 'react';
import { examScheduleService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { Calendar, Clock, MapPin, AlertCircle, Info } from 'lucide-react';
import { format } from 'date-fns';

const TERMS = ['First Term', 'Second Term', 'Third Term'];

export default function StudentExamSchedule() {
  const { user } = useAuthStore();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('First Term');
  const currentYear = new Date().getFullYear();
  const [academicYear, setAcademicYear] = useState(String(currentYear));

  useEffect(() => {
    setLoading(true);
    examScheduleService
      .getStudentSchedules({ term, academicYear })
      .then((r) => setSchedules(r.data.data?.schedules || []))
      .catch(() => toast.error('Failed to load schedules'))
      .finally(() => setLoading(false));
  }, [term, academicYear]);

  return (
    <div className="student-exam-container">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Exam Schedule</h1>
          <p className="page-header__subtitle">
            {user?.studentProfile?.class?.name
              ? `Academic Roadmap for ${user.studentProfile.class.name}`
              : 'Your personalized exam schedule'}
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
          className="form-control year-input"
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          placeholder="Year"
        />
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="empty-state">
          <Calendar size={48} className="empty-state__icon" />
          <h3 className="empty-state__title">No Exams Found</h3>
          <p className="empty-state__text">
            There are no scheduled exams for {term} {academicYear}.
          </p>
        </div>
      ) : (
        schedules.map((schedule) => (
          <div key={schedule._id} className="exam-card">
            {/* 1. Header Banner */}
            <div className="exam-banner">
              <div className="exam-banner__title-area">
                <h2>{schedule.title}</h2>
                <div className="d-flex gap-2">
                  <span className="badge badge--info">{schedule.examType}</span>
                  <span className="text-muted text-sm">
                    {schedule.class?.name}
                  </span>
                </div>
              </div>
              <div className="exam-banner__details">
                <span className="date-range">
                  {format(new Date(schedule.startDate), 'MMM dd')} -{' '}
                  {format(new Date(schedule.endDate), 'MMM dd, yyyy')}
                </span>
                <span className="session-tag">
                  {schedule.sessions?.length || 0} Scheduled Sessions
                </span>
              </div>
            </div>

            {/* 2. Admin Notes */}
            {schedule.notes && (
              <div className="notes-callout">
                <AlertCircle size={18} />
                <p>{schedule.notes}</p>
              </div>
            )}

            {/* 3. Sessions Table */}
            <div className="exam-table-container">
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Venue</th>
                      <th>Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.sessions.map((session, idx) => (
                      <tr key={idx}>
                        <td>
                          <div className="subject-info">
                            <span className="name">
                              {session.subject?.name}
                            </span>
                            <span className="code">
                              {session.subject?.code}
                            </span>
                          </div>
                        </td>
                        <td className="font-semibold">
                          {format(new Date(session.date), 'EEE, MMM dd')}
                        </td>
                        <td className="time-slot">
                          <div className="d-flex align-center gap-2">
                            <Clock size={14} className="text-muted" />
                            {session.startTime} - {session.endTime}
                          </div>
                        </td>
                        <td>
                          <div className="d-flex align-center gap-2">
                            <MapPin size={14} className="text-muted" />
                            {session.venue}
                          </div>
                        </td>
                        <td>
                          <span className="badge badge--neutral">
                            {session.maxMarks}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Footer Instructions */}
            {schedule.sessions?.[0]?.instructions && (
              <div className="instruction-footer">
                <h4>
                  <Info size={16} /> Candidate Instructions
                </h4>
                <p>{schedule.sessions[0].instructions}</p>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
