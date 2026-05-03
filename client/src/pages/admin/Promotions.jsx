import React, { useState, useEffect } from 'react';
import { promotionService, classService } from '../../services/api';
import { toast } from 'react-hot-toast';

const Promotions = () => {
  const [promotions, setPromotions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  const [stats, setStats] = useState(null);

  const [formData, setFormData] = useState({
    academicYear: new Date().getFullYear().toString(),
    fromClass: '',
    toClass: '',
    criteria: {
      minimumAverage: 40,
      maximumFailures: 3,
      coreSubjectsMustPass: true,
      coreSubjects: [],
    },
  });

  useEffect(() => {
    fetchPromotions();
    fetchClasses();
  }, []);

  const fetchPromotions = async () => {
    try {
      setLoading(true);
      const response = await promotionService.getAll();

      setPromotions(response?.data?.data);
    } catch (error) {
      toast.error('Failed to fetch promotions');
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      await promotionService.create(formData);
      toast.success('Promotion batch created successfully');
      setShowModal(false);
      resetForm();
      fetchPromotions();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to create promotion batch',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAutoProcess = async (id) => {
    if (
      !window.confirm(
        'Are you sure you want to auto-process this promotion? This will evaluate all students based on the criteria.',
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      await promotionService.autoProcess(id);
      toast.success('Promotion processed successfully');
      fetchPromotions();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to process promotion',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (id) => {
    if (
      !window.confirm(
        'Are you sure you want to apply these promotions? This will update student classes and cannot be undone.',
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      await promotionService.apply(id);
      toast.success('Promotions applied successfully');
      fetchPromotions();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to apply promotions',
      );
    } finally {
      setLoading(false);
    }
  };

  const viewDetails = async (promotion) => {
    try {
      setLoading(true);
      const [detailsRes, statsRes] = await Promise.all([
        promotionService.getById(promotion._id),
        promotionService.getStats(promotion._id),
      ]);

      setSelectedPromotion(detailsRes.data.data);
      setStats(statsRes.data.data);
    } catch (error) {
      toast.error('Failed to load promotion details');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (
      !window.confirm('Are you sure you want to delete this promotion batch?')
    ) {
      return;
    }

    try {
      setLoading(true);
      await promotionService.delete(id);
      toast.success('Promotion batch deleted successfully');
      fetchPromotions();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to delete promotion',
      );
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      academicYear: new Date().getFullYear().toString(),
      fromClass: '',
      toClass: '',
      criteria: {
        minimumAverage: 40,
        maximumFailures: 3,
        coreSubjectsMustPass: true,
        coreSubjects: [],
      },
    });
  };

  return (
    <div className="promotions-page">
      <div className="page-header">
        <h1>Class Promotion & Advancement</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          Create Promotion Batch
        </button>
      </div>

      {loading && <div className="loading-spinner">Loading...</div>}

      <div className="promotions-list">
        {promotions.length > 0 &&
          promotions.map((promotion) => (
            <div key={promotion._id} className="promotion-card">
              <div className="promotion-header">
                <div>
                  <h3>
                    {promotion.fromClass?.name} →{' '}
                    {promotion.toClass?.name || 'Graduation'}
                  </h3>
                  <p className="promotion-meta">
                    Academic Year: {promotion.academicYear}
                  </p>
                </div>
                <span
                  className={`status-badge status-${promotion.status.toLowerCase()}`}
                >
                  {promotion.status}
                </span>
              </div>

              <div className="promotion-info">
                <p>
                  <strong>Criteria:</strong>
                </p>
                <ul>
                  <li>Minimum Average: {promotion.criteria.minimumAverage}%</li>
                  <li>
                    Maximum Failures: {promotion.criteria.maximumFailures}{' '}
                    subjects
                  </li>
                  <li>
                    Core Subjects:{' '}
                    {promotion.criteria.coreSubjectsMustPass
                      ? 'Must Pass'
                      : 'Optional'}
                  </li>
                </ul>
              </div>

              <div className="promotion-actions">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => viewDetails(promotion)}
                >
                  View Details
                </button>

                {promotion.status === 'Draft' && (
                  <>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleAutoProcess(promotion._id)}
                    >
                      Auto Process
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(promotion._id)}
                    >
                      Delete
                    </button>
                  </>
                )}

                {promotion.status === 'Completed' && (
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => handleApply(promotion._id)}
                  >
                    Apply Promotions
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content promotion-modal">
            <div className="modal-header">
              <h2>Create Promotion Batch</h2>
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
                <label>From Class *</label>
                <select
                  value={formData.fromClass}
                  onChange={(e) =>
                    setFormData({ ...formData, fromClass: e.target.value })
                  }
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
                <label>To Class</label>
                <select
                  value={formData.toClass}
                  onChange={(e) =>
                    setFormData({ ...formData, toClass: e.target.value })
                  }
                >
                  <option value="">Graduation (No next class)</option>
                  {classes.map((cls) => (
                    <option key={cls._id} value={cls._id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              <h3>Promotion Criteria</h3>

              <div className="form-group">
                <label>Minimum Average (%) *</label>
                <input
                  type="number"
                  value={formData.criteria.minimumAverage}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      criteria: {
                        ...formData.criteria,
                        minimumAverage: parseInt(e.target.value),
                      },
                    })
                  }
                  min="0"
                  max="100"
                  required
                />
              </div>

              <div className="form-group">
                <label>Maximum Failed Subjects *</label>
                <input
                  type="number"
                  value={formData.criteria.maximumFailures}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      criteria: {
                        ...formData.criteria,
                        maximumFailures: parseInt(e.target.value),
                      },
                    })
                  }
                  min="0"
                  required
                />
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.criteria.coreSubjectsMustPass}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        criteria: {
                          ...formData.criteria,
                          coreSubjectsMustPass: e.target.checked,
                        },
                      })
                    }
                  />
                  Core subjects must be passed
                </label>
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
                  {loading ? 'Creating...' : 'Create Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedPromotion && stats && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedPromotion(null)}
        >
          <div
            className="modal-content promotion-details-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Promotion Details</h2>
              <button
                className="close-btn"
                onClick={() => setSelectedPromotion(null)}
              >
                ×
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <label>Total Students</label>
                <p className="big-number">{stats.total}</p>
              </div>
              <div className="stat-card success">
                <label>Promoted</label>
                <p className="big-number">{stats.promoted}</p>
              </div>
              <div className="stat-card warning">
                <label>Repeated</label>
                <p className="big-number">{stats.repeated}</p>
              </div>
              <div className="stat-card info">
                <label>Pass Rate</label>
                <p className="big-number">{stats.passRate}%</p>
              </div>
            </div>

            <div className="students-table">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Average</th>
                    <th>Position</th>
                    <th>Status</th>
                    <th>Promoted To</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPromotion.students.map((entry) => (
                    <tr key={entry.student._id}>
                      <td>
                        {entry.student.firstName} {entry.student.lastName}
                      </td>
                      <td>{entry.yearlyAverage}%</td>
                      <td>
                        {entry.yearlyPosition}/{entry.totalStudents}
                      </td>
                      <td>
                        <span
                          className={`status-badge status-${entry.status.toLowerCase()}`}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td>{entry.promotedTo?.name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Promotions;
