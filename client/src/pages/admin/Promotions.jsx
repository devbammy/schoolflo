import React, { useState, useEffect } from 'react';
import {
  Plus,
  ArrowRight,
  GraduationCap,
  Trash2,
  Play,
  CheckCircle,
  Info,
  Users,
  Award,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  promotionService,
  classService,
  caTrackingService,
} from '../../services/api';
import { toast } from 'react-hot-toast';
import Modal from '../../components/common/Modal';
import {
  generateAcademicYearOptions,
  getCurrentAcademicYear,
} from '../../utils/academicYear';

const Promotions = () => {
  const [promotions, setPromotions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const academicYears = generateAcademicYearOptions({
    count: 3,
    includeFuture: true,
  });

  const initialForm = {
    academicYear: getCurrentAcademicYear(),
    fromClass: '',
    toClass: '',
    criteria: {
      minimumAverage: 40,
      maximumFailures: 3,
      coreSubjectsMustPass: true,
      coreSubjects: [],
    },
  };
  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    fetchPromotions();
    fetchClasses();
  }, []);

  const fetchPromotions = async () => {
    try {
      setLoading(true);
      const response = await promotionService.getAll();
      setPromotions(response?.data?.data || []);
    } catch (error) {
      toast.error('Failed to fetch promotions');
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

  const handleInputChange = (path, value) => {
    const keys = path.split('.');
    if (keys.length > 1) {
      setFormData((prev) => ({
        ...prev,
        [keys[0]]: { ...prev[keys[0]], [keys[1]]: value },
      }));
    } else {
      setFormData((prev) => ({ ...prev, [path]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.fromClass) return toast.error('Source class is required');

    try {
      setSaving(true);
      await promotionService.create(formData);
      toast.success('Promotion batch created');
      setModal(null);
      setFormData(initialForm);
      fetchPromotions();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create batch');
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (action, id, message) => {
    if (!window.confirm(message)) return;
    try {
      setLoading(true);
      await promotionService[action](id);
      toast.success(`Action successful`);
      fetchPromotions();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Action failed');
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
      setModal('details');
    } catch (error) {
      toast.error('Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncClassTrackers = async () => {
    if (!formData.fromClass) {
      return toast.error('Please select a class first');
    }

    const confirmSync = window.confirm(
      'This will sync CA Tracker data from published results for all students in this class. Continue?',
    );
    if (!confirmSync) return;

    const academicYear = formData.academicYear?.includes('/')
      ? formData.academicYear
      : getCurrentAcademicYear();

    try {
      setSyncing(true);
      await caTrackingService.syncClass({
        classId: formData.fromClass,
        academicYear: formData.academicYear,
      });
      toast.success('CA Tracker synced successfully!');
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to sync CA Tracker data',
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="promotions-container">
      <header className="page-header">
        <div className="header-text">
          <h1 className="title">Academic Promotions</h1>
          <p className="subtitle">
            Manage student advancement and graduation cycles
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('form')}>
          <Plus size={18} /> <span>Create Promotion Batch</span>
        </button>
      </header>

      {loading && !modal && (
        <div className="loader-container">
          <div className="loader" />
        </div>
      )}

      <div className="promotions-grid">
        {promotions.map((promotion) => (
          <div key={promotion._id} className="promo-card">
            <div className="promo-card-header">
              <div className="pathway">
                <span className="class-pill">{promotion.fromClass?.name}</span>
                <ArrowRight size={16} className="arrow" />
                <span className="class-pill highlight">
                  {promotion.toClass?.name || (
                    <>
                      <GraduationCap size={14} /> Graduation
                    </>
                  )}
                </span>
              </div>
              <span
                className={`status-badge status-${promotion.status.toLowerCase()}`}
              >
                {promotion.status}
              </span>
            </div>

            <div className="promo-details">
              <div className="detail-item">
                <label>Academic Year</label>
                <span>{promotion.academicYear}</span>
              </div>
              <div className="detail-item">
                <label>Threshold</label>
                <span>{promotion.criteria.minimumAverage}% Avg</span>
              </div>
            </div>

            <div className="promo-actions">
              <button
                className="action-btn info"
                onClick={() => viewDetails(promotion)}
              >
                <Info size={16} /> Details
              </button>

              {promotion.status === 'Draft' && (
                <>
                  <button
                    className="action-btn primary"
                    onClick={() =>
                      handleAction(
                        'autoProcess',
                        promotion._id,
                        'Analyze student performance?',
                      )
                    }
                  >
                    <Play size={16} /> Process
                  </button>
                  <button
                    className="action-btn danger"
                    onClick={() =>
                      handleAction(
                        'delete',
                        promotion._id,
                        'Delete this batch?',
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}

              {promotion.status === 'Completed' && (
                <button
                  className="action-btn success"
                  onClick={() =>
                    handleAction(
                      'apply',
                      promotion._id,
                      'Apply changes permanently?',
                    )
                  }
                >
                  <CheckCircle size={16} /> Apply Changes
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* CREATE MODAL */}

      <Modal
        open={modal === 'form'}
        onClose={() => setModal(null)}
        title="Configure New Promotion"
      >
        <form className="modern-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Academic Year</label>

            <select
              className="form-control"
              required
              value={formData.academicYear}
              onChange={(e) =>
                setFormData((f) => ({ ...f, academicYear: e.target.value }))
              }
            >
              {academicYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>From Class</label>
              <select
                value={formData.fromClass}
                onChange={(e) => handleInputChange('fromClass', e.target.value)}
              >
                <option value="">Select source class...</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>To Class (Target)</label>
              <select
                value={formData.toClass}
                onChange={(e) => handleInputChange('toClass', e.target.value)}
              >
                <option value="">Graduation</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dedicated row for the Sync button so it doesn't crowd inputs */}
          <div className="form-row full-width">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSyncClassTrackers}
              disabled={syncing || !formData.fromClass}
            >
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
              <span>
                {syncing ? 'Synchronizing Data...' : 'Sync Class CA Tracker'}
              </span>
            </button>
          </div>

          <div className="criteria-section">
            <h4>Promotion Criteria</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Min. Average (%)</label>
                <input
                  type="number"
                  value={formData.criteria.minimumAverage}
                  onChange={(e) =>
                    handleInputChange('criteria.minimumAverage', e.target.value)
                  }
                />
              </div>
              <div className="form-group">
                <label>Max. Failures Allowed</label>
                <input
                  type="number"
                  value={formData.criteria.maximumFailures}
                  onChange={(e) =>
                    handleInputChange(
                      'criteria.maximumFailures',
                      e.target.value,
                    )
                  }
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating Batch...' : 'Initialize Promotion Batch'}
            </button>
          </div>
        </form>
      </Modal>

      {/* DETAILS MODAL */}
      <Modal
        open={modal === 'details'}
        onClose={() => setModal(null)}
        title="Evaluation Summary"
        maxWidth={900}
      >
        {stats && selectedPromotion && (
          <div className="summary-layout">
            <div className="stats-header">
              <div className="stat-box">
                <Users className="icon" />
                <div>
                  <label>Total</label>
                  <strong>{stats.total}</strong>
                </div>
              </div>
              <div className="stat-box success">
                <Award className="icon" />
                <div>
                  <label>Promoted</label>
                  <strong>{stats.promoted}</strong>
                </div>
              </div>
              <div className="stat-box danger">
                <AlertCircle className="icon" />
                <div>
                  <label>Repeated</label>
                  <strong>{stats.repeated}</strong>
                </div>
              </div>
              <div className="stat-box info">
                <div className="progress-circle">{stats.passRate}%</div>
                <div>
                  <label>Success Rate</label>
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Average</th>
                    <th>Rank</th>
                    <th>Result</th>
                    <th>Destination</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPromotion.students.map((entry) => (
                    <tr key={entry.student._id}>
                      <td className="font-medium">
                        {entry.student.firstName} {entry.student.lastName}
                      </td>
                      <td>
                        <span className="avg-badge">
                          {entry.yearlyAverage}%
                        </span>
                      </td>
                      <td className="text-muted">
                        {entry.yearlyPosition} / {entry.totalStudents}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${entry.status.toLowerCase()}`}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td className="text-sm">
                        {entry.promotedTo?.name || 'Graduated'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Promotions;
