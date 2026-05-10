import React, { useEffect, useState } from 'react';
import { examScheduleService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { Calendar, Users, AlertCircle, BookOpen } from 'lucide-react';
import { format, isPast } from 'date-fns';
import {
  getCurrentAcademicYear,
  generateAcademicYearOptions,
} from '../../utils/academicYear';

const TERMS = ['First Term', 'Second Term', 'Third Term'];

export default function ParentExamSchedule() {
  const { user } = useAuthStore();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('First Term');
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [selectedChild, setSelectedChild] = useState(null);

  const children = (user?.parentProfile?.children || []).filter((c) => c?._id);

  useEffect(() => {
    setLoading(true);
    examScheduleService
      .getParentSchedules({ term, academicYear })
      .then((r) => setSchedules(r.data.data?.schedules || []))
      .catch(() => toast.error('Failed to load schedules'))
      .finally(() => setLoading(false));
  }, [term, academicYear]);

  const filteredSchedules = selectedChild
    ? schedules.filter((s) =>
        s.class?.name
          ?.toLowerCase()
          .includes(
            children
              .find((c) => c._id === selectedChild)
              ?.studentProfile?.class?.name?.toLowerCase(),
          ),
      )
    : schedules;

  if (children.length === 0) {
    return (
      <div className="empty-state-wrapper">
        <div className="empty-state">
          <Users size={64} className="empty-state__icon" />
          <h2 className="empty-state__title">No Linked Children</h2>
          <p className="empty-state__text">
            Please contact administration to link your children's profiles to
            your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="parent-schedule-container">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Children's Exam Schedule</h1>
          <p className="page-header__subtitle">
            Monitoring academic milestones for your family
          </p>
        </div>
      </div>

      {/* Selection & Filter Bar */}
      <div className="selection-bar">
        <div className="selection-bar__filters">
          {TERMS.map((t) => (
            <button
              key={t}
              className={`btn btn--sm ${term === t ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setTerm(t)}
            >
              {t}
            </button>
          ))}
          <select
            className="form-control"
            style={{ width: 140 }}
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

        <select
          className="form-control"
          style={{ width: 'auto' }}
          value={selectedChild || ''}
          onChange={(e) => setSelectedChild(e.target.value || null)}
        >
          <option value="">All Children</option>
          {children.map((child) => (
            <option key={child._id} value={child._id}>
              {child.firstName} {child.lastName}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner" />
        </div>
      ) : filteredSchedules.length === 0 ? (
        <div className="card empty-state">
          <Calendar size={48} className="empty-state__icon" />
          <p className="empty-state__title">No Schedules Available</p>
          <p className="empty-state__text">
            No exam schedules have been published for the selected criteria.
          </p>
        </div>
      ) : (
        <div className="schedule-grid">
          {filteredSchedules.map((schedule) => (
            <div key={schedule._id} className="child-exam-card">
              <div className="child-exam-card__header">
                <div>
                  <h2>{schedule.title}</h2>
                  <div className="d-flex gap-3 align-center">
                    <span className="badge badge--purple">
                      {schedule.examType}
                    </span>
                    <span className="text-muted text-sm">
                      <BookOpen size={14} style={{ verticalAlign: 'middle' }} />{' '}
                      {schedule.class?.name}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="font-semibold text-sm">
                    {format(new Date(schedule.startDate), 'dd MMM')} -{' '}
                    {format(new Date(schedule.endDate), 'dd MMM yyyy')}
                  </span>
                  <p className="text-muted text-sm mt-4">
                    {schedule.sessions?.length} Subjects Scheduled
                  </p>
                </div>
              </div>

              {schedule.notes && (
                <div className="notes-alert">
                  <AlertCircle size={18} />
                  <span>{schedule.notes}</span>
                </div>
              )}

              <div
                className="table-wrapper"
                style={{
                  margin: '30px 24px 24px',
                  border: '1px solid var(--clr-border)',
                }}
              >
                <table className="table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Date & Status</th>
                      <th>Time</th>
                      <th>Venue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.sessions.map((session, idx) => {
                      const past = isPast(new Date(session.date));
                      return (
                        <tr key={idx} className={past ? 'is-past' : ''}>
                          <td>
                            <span
                              className="subject-name"
                              style={{ fontWeight: 600 }}
                            >
                              {session.subject?.name}
                            </span>
                            <br />
                            <small>{session.subject?.code}</small>
                          </td>
                          <td>
                            <div className="d-flex align-center gap-2">
                              {past ? (
                                <span className="status-tag status-tag--completed">
                                  Done
                                </span>
                              ) : (
                                <span className="status-tag status-tag--upcoming">
                                  Next
                                </span>
                              )}
                              {format(new Date(session.date), 'EEE, dd MMM')}
                            </div>
                          </td>
                          <td className="text-sm">
                            {session.startTime} - {session.endTime}
                          </td>
                          <td>{session.venue}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
