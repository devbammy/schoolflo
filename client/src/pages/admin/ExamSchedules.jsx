import React, { useState, useEffect } from 'react';
import {
  examScheduleService,
  classService,
  subjectService,
} from '../../services/api';
import { toast } from 'react-hot-toast';

const ExamSchedules = () => {
  const [schedules, setSchedules] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    examType: 'Final Exam',
    class: '',
    term: 'First Term',
    academicYear: new Date().getFullYear().toString(),
    startDate: '',
    endDate: '',
    sessions: [],
  });

  useEffect(() => {
    fetchSchedules();
    fetchClasses();
  }, []);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const response = await examScheduleService.getAll();
      setSchedules(response?.data?.data);
    } catch (error) {
      toast.error('Failed to fetch exam schedules');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await classService.getAll();
      setClasses(response?.data?.data?.classes);
    } catch (error) {
      console.error('Failed to fetch classes');
    }
  };

  const handleClassChange = async (classId) => {
    setFormData({ ...formData, class: classId });

    // Fetch subjects for selected class
    try {
      const response = await classService.getById(classId);
      setSubjects(response.data.data.subjects || []);
    } catch (error) {
      console.error('Failed to fetch subjects');
    }
  };

  const addSession = () => {
    setFormData({
      ...formData,
      sessions: [
        ...formData.sessions,
        {
          subject: '',
          date: '',
          startTime: '',
          endTime: '',
          duration: 120,
          venue: '',
          invigilators: [],
          maxMarks: 70,
          instructions: '',
        },
      ],
    });
  };

  const updateSession = (index, field, value) => {
    const updatedSessions = [...formData.sessions];
    updatedSessions[index][field] = value;
    setFormData({ ...formData, sessions: updatedSessions });
  };

  const removeSession = (index) => {
    const updatedSessions = formData.sessions.filter((_, i) => i !== index);
    setFormData({ ...formData, sessions: updatedSessions });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      if (editingSchedule) {
        await examScheduleAPI.update(editingSchedule._id, formData);
        toast.success('Exam schedule updated successfully');
      } else {
        await examScheduleAPI.create(formData);
        toast.success('Exam schedule created successfully');
      }

      setShowModal(false);
      resetForm();
      fetchSchedules();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to save exam schedule',
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (id) => {
    if (
      !window.confirm(
        'Are you sure you want to publish this exam schedule? Students and teachers will be notified.',
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      await examScheduleAPI.publish(id);
      toast.success('Exam schedule published successfully');
      fetchSchedules();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to publish schedule',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (
      !window.confirm('Are you sure you want to delete this exam schedule?')
    ) {
      return;
    }

    try {
      setLoading(true);
      await examScheduleAPI.delete(id);
      toast.success('Exam schedule deleted successfully');
      fetchSchedules();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete schedule');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      examType: 'Final Exam',
      class: '',
      term: 'First Term',
      academicYear: new Date().getFullYear().toString(),
      startDate: '',
      endDate: '',
      sessions: [],
    });
    setEditingSchedule(null);
  };

  return (
    <div className="exam-schedules-page">
      <div className="page-header">
        <h1>Examination Scheduling</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          Create Exam Schedule
        </button>
      </div>

      {loading && <div className="loading-spinner">Loading...</div>}

      <div className="schedules-list">
        {schedules.length > 0 &&
          schedules.map((schedule) => (
            <div key={schedule._id} className="schedule-card">
              <div className="schedule-header">
                <div>
                  <h3>{schedule.title}</h3>
                  <p className="schedule-meta">
                    {schedule.examType} • {schedule.class?.name} •{' '}
                    {schedule.term} {schedule.academicYear}
                  </p>
                </div>
                <div className="schedule-status">
                  {schedule.isPublished ? (
                    <span className="badge badge-success">Published</span>
                  ) : (
                    <span className="badge badge-warning">Draft</span>
                  )}
                </div>
              </div>

              <div className="schedule-dates">
                <p>
                  <strong>Duration:</strong>{' '}
                  {new Date(schedule.startDate).toLocaleDateString()} -{' '}
                  {new Date(schedule.endDate).toLocaleDateString()}
                </p>
                <p>
                  <strong>Sessions:</strong> {schedule.sessions.length} exams
                  scheduled
                </p>
              </div>

              <div className="schedule-actions">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setEditingSchedule(schedule);
                    setFormData(schedule);
                    setShowModal(true);
                  }}
                >
                  Edit
                </button>

                {!schedule.isPublished && (
                  <>
                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => handlePublish(schedule._id)}
                    >
                      Publish
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(schedule._id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
      </div>

      {/* Modal for Create/Edit */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content exam-schedule-modal">
            <div className="modal-header">
              <h2>
                {editingSchedule
                  ? 'Edit Exam Schedule'
                  : 'Create Exam Schedule'}
              </h2>
              <button
                className="close-btn"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Exam Type *</label>
                  <select
                    value={formData.examType}
                    onChange={(e) =>
                      setFormData({ ...formData, examType: e.target.value })
                    }
                    required
                  >
                    <option value="Mid-Term">Mid-Term</option>
                    <option value="Final Exam">Final Exam</option>
                    <option value="Mock Exam">Mock Exam</option>
                    <option value="External Exam">External Exam</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Class *</label>
                  <select
                    value={formData.class}
                    onChange={(e) => handleClassChange(e.target.value)}
                    required
                  >
                    <option value="">Select Class</option>
                    {classes.map((cls) => (
                      <option key={cls._id} value={cls._id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Term *</label>
                  <select
                    value={formData.term}
                    onChange={(e) =>
                      setFormData({ ...formData, term: e.target.value })
                    }
                    required
                  >
                    <option value="First Term">First Term</option>
                    <option value="Second Term">Second Term</option>
                    <option value="Third Term">Third Term</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Academic Year *</label>
                  <input
                    type="text"
                    value={formData.academicYear}
                    onChange={(e) =>
                      setFormData({ ...formData, academicYear: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Start Date *</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>End Date *</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData({ ...formData, endDate: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              {/* Exam Sessions */}
              <div className="sessions-section">
                <div className="section-header">
                  <h3>Exam Sessions</h3>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={addSession}
                  >
                    Add Session
                  </button>
                </div>

                {formData.sessions.map((session, index) => (
                  <div key={index} className="session-card">
                    <div className="session-header">
                      <h4>Session {index + 1}</h4>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => removeSession(index)}
                      >
                        Remove
                      </button>
                    </div>

                    <div className="form-grid">
                      <div className="form-group">
                        <label>Subject *</label>
                        <select
                          value={session.subject}
                          onChange={(e) =>
                            updateSession(index, 'subject', e.target.value)
                          }
                          required
                        >
                          <option value="">Select Subject</option>
                          {subjects.map((subject) => (
                            <option key={subject._id} value={subject._id}>
                              {subject.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Date *</label>
                        <input
                          type="date"
                          value={session.date}
                          onChange={(e) =>
                            updateSession(index, 'date', e.target.value)
                          }
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Start Time *</label>
                        <input
                          type="time"
                          value={session.startTime}
                          onChange={(e) =>
                            updateSession(index, 'startTime', e.target.value)
                          }
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>End Time *</label>
                        <input
                          type="time"
                          value={session.endTime}
                          onChange={(e) =>
                            updateSession(index, 'endTime', e.target.value)
                          }
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Venue *</label>
                        <input
                          type="text"
                          value={session.venue}
                          onChange={(e) =>
                            updateSession(index, 'venue', e.target.value)
                          }
                          placeholder="e.g., Hall A, Room 101"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Max Marks</label>
                        <input
                          type="number"
                          value={session.maxMarks}
                          onChange={(e) =>
                            updateSession(
                              index,
                              'maxMarks',
                              parseInt(e.target.value),
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Instructions</label>
                      <textarea
                        value={session.instructions}
                        onChange={(e) =>
                          updateSession(index, 'instructions', e.target.value)
                        }
                        rows="2"
                        placeholder="Special instructions for this exam session"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading
                    ? 'Saving...'
                    : editingSchedule
                      ? 'Update Schedule'
                      : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamSchedules;
