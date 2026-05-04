import React, { useState, useEffect } from 'react';
import { examScheduleService, classService } from '../../services/api';
import { toast } from 'react-hot-toast';
import Modal from '../../components/common/Modal'; //

const ExamSchedules = () => {
  const [schedules, setSchedules] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false); //
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
      setSchedules(response?.data?.data || []);
    } catch (error) {
      toast.error('Failed to fetch exam schedules');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await classService.getAll();
      setClasses(response?.data?.data?.classes || []);
    } catch (error) {
      console.error('Failed to fetch classes');
    }
  };

  const handleClassChange = async (classId) => {
    setFormData({ ...formData, class: classId });
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
    if (e) e.preventDefault();
    try {
      setLoading(true);
      if (editingSchedule) {
        await examScheduleService.update(editingSchedule._id, formData);
        toast.success('Exam schedule updated successfully');
      } else {
        await examScheduleService.create(formData);
        toast.success('Exam schedule created successfully');
      }
      setModalOpen(false);
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
    if (!window.confirm('Are you sure you want to publish this exam schedule?'))
      return;
    try {
      setLoading(true);
      await examScheduleService.publish(id);
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
    if (!window.confirm('Are you sure you want to delete this exam schedule?'))
      return;
    try {
      setLoading(true);
      await examScheduleService.delete(id);
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
        <div>
          <h1 className="page-header__title">Examination Scheduling</h1>
          <p className="page-header__subtitle">
            {schedules.length} schedules managed
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setModalOpen(true)}>
          Create Exam Schedule
        </button>
      </div>

      {loading && !modalOpen && (
        <div className="spinner" style={{ margin: '40px auto' }} />
      )}

      <div
        className="schedules-list"
        style={{ display: 'grid', gap: '20px', marginTop: '24px' }}
      >
        {schedules.map((schedule) => (
          <div key={schedule._id} className="card schedule-card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>{schedule.title}</h3>
                <p
                  style={{
                    color: 'var(--clr-text-3)',
                    fontSize: '0.875rem',
                    marginTop: '4px',
                  }}
                >
                  {schedule.examType} • {schedule.class?.name} • {schedule.term}{' '}
                  {schedule.academicYear}
                </p>
              </div>
              <span
                className={`badge ${schedule.isPublished ? 'badge--success' : 'badge--warning'}`}
              >
                {schedule.isPublished ? 'Published' : 'Draft'}
              </span>
            </div>

            <div style={{ margin: '16px 0', fontSize: '0.875rem' }}>
              <strong>Duration:</strong>{' '}
              {new Date(schedule.startDate).toLocaleDateString()} -{' '}
              {new Date(schedule.endDate).toLocaleDateString()}
              <br />
              <strong>Sessions:</strong> {schedule.sessions.length} exams
              scheduled
            </div>

            <div
              className="card-actions"
              style={{ display: 'flex', gap: '8px' }}
            >
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setEditingSchedule(schedule);
                  setFormData(schedule);
                  setModalOpen(true);
                }}
              >
                Edit
              </button>
              {!schedule.isPublished && (
                <>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => handlePublish(schedule._id)}
                  >
                    Publish
                  </button>
                  <button
                    className="btn btn--danger btn--sm"
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

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={editingSchedule ? 'Edit Exam Schedule' : 'Create Exam Schedule'}
        maxWidth={800}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading
                ? 'Saving...'
                : editingSchedule
                  ? 'Update Schedule'
                  : 'Create Schedule'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '20px' }}>
          <div
            className="form-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
            }}
          >
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input
                className="form-control"
                type="text"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
              />
            </div>
            {/* ... Other Header Fields like Exam Type, Class, etc. using .form-control class */}
          </div>

          <div className="sessions-section">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ fontSize: '1rem', margin: 0 }}>Exam Sessions</h3>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={addSession}
              >
                + Add Session
              </button>
            </div>

            {formData.sessions.map((session, index) => (
              <div
                key={index}
                className="card"
                style={{
                  padding: '16px',
                  marginBottom: '12px',
                  border: '1px solid var(--clr-border)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: '0.875rem' }}>
                    Session {index + 1}
                  </h4>
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={() => removeSession(index)}
                  >
                    Remove
                  </button>
                </div>
                {/* Session specific inputs using .form-control */}
              </div>
            ))}
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ExamSchedules;
