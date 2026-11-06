import React, { useEffect, useState, useCallback } from 'react';
import { Upload, Clock, CheckCircle, FileText } from 'lucide-react';
import { assignmentService, submissionService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { format, isPast } from 'date-fns';
import './styles/assignment.scss';

export default function StudentAssignments() {
  const { user } = useAuthStore();

  const [assignments, setAssignments] = useState([]);
  const [submissionsMap, setSubmissionsMap] = useState({});
  const [loading, setLoading] = useState(true);

  const [activeAssignment, setActiveAssignment] = useState(null);
  const [files, setFiles] = useState([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ---------------- FETCH DATA ----------------
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const classId = user?.studentProfile?.class?._id;

      const [assignmentsRes, submissionsRes] = await Promise.all([
        assignmentService.getAll({ classId }),
        submissionService.getMine(),
      ]);

      setAssignments(assignmentsRes.data?.data?.assignments || []);

      const map = {};
      (submissionsRes.data?.data?.submissions || []).forEach((s) => {
        const id = s.assignment?._id || s.assignment;
        map[id] = s;
      });

      setSubmissionsMap(map);
    } catch (err) {
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------------- SUBMIT ----------------
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!activeAssignment) return;
    setSubmitting(true);

    try {
      await submissionService.submit({
        assignmentId: activeAssignment._id,
        files,
        comment,
      });

      toast.success('Assignment submitted successfully');

      setActiveAssignment(null);
      setFiles([]);
      setComment('');

      // refresh submissions only
      const res = await submissionService.getMine();
      const map = {};
      (res.data?.data?.submissions || []).forEach((s) => {
        const id = s.assignment?._id || s.assignment;
        map[id] = s;
      });
      setSubmissionsMap(map);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------- LOADING ----------------
  if (loading)
    return (
      <div className="flex justify-center p-20">
        <div className="spinner" />
      </div>
    );

  // ---------------- UI ----------------
  return (
    <div className="assignments-page">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Course Assignments</h1>
          <p className="page-header__subtitle">
            {assignments.length} Total Tasks
          </p>
        </div>
      </div>

      <div className="assignment-grid">
        {assignments.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <FileText size={40} color="var(--clr-text-3)" />
              <p className="empty-state__title">
                All caught up! No assignments assigned.
              </p>
            </div>
          </div>
        ) : (
          assignments.map((a) => {
            const submission = submissionsMap[a._id];
            const overdue = isPast(new Date(a.dueDate));

            const badgeClass =
              submission?.status === 'Graded'
                ? 'success'
                : submission
                  ? 'info'
                  : overdue
                    ? 'danger'
                    : 'warning';

            return (
              <div key={a._id} className="card">
                <div className="card__body">
                  <div style={{ flex: 1 }}>
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="card__title">{a.title}</h4>
                      <span className={`badge badge--${badgeClass}`}>
                        {submission?.status ||
                          (overdue ? 'Overdue' : 'Pending')}
                      </span>
                    </div>

                    <p className="card__desc">{a.description}</p>

                    <div className="meta-group">
                      <div className="meta-group__item">
                        <strong>Subject:</strong> {a.subject?.name}
                      </div>
                      <div className="meta-group__item">
                        <strong>Marks:</strong> {a.totalMarks}
                      </div>
                      <div
                        className={`meta-group__item ${overdue && !submission ? 'overdue-text' : ''}`}
                      >
                        <Clock size={14} />
                        Due: {format(new Date(a.dueDate), 'dd MMM, p')}
                      </div>
                    </div>

                    {submission?.status === 'Graded' && (
                      <div className="graded-box">
                        <span className="graded-box__score">
                          Result: {submission.score} / {a.totalMarks}
                        </span>
                        {submission.feedback && (
                          <p className="graded-box__feedback">
                            "{submission.feedback}"
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center">
                    {!submission && !overdue && (
                      <button
                        className="btn btn--primary"
                        onClick={() => setActiveAssignment(a)}
                      >
                        <Upload size={16} /> Submit Task
                      </button>
                    )}
                    {submission && (
                      <div className="flex items-center gap-2 text-success font-semibold">
                        <CheckCircle size={18} /> Submitted
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ---------------- SUBMISSION MODAL ---------------- */}
      {activeAssignment && (
        <div
          className="modal-overlay"
          onClick={(e) =>
            e.target === e.currentTarget && setActiveAssignment(null)
          }
        >
          <div className="modal">
            <div className="modal__header">
              <h3 className="modal__title">Submit Work</h3>
              <button
                className="btn btn--ghost"
                onClick={() => setActiveAssignment(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal__body">
                <div className="form-group">
                  <label className="form-label">Upload Files</label>
                  <input
                    type="file"
                    multiple
                    className="form-control"
                    onChange={(e) => setFiles(Array.from(e.target.files))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Notes for Teacher</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    placeholder="Any comments regarding your submission..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal__footer">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setActiveAssignment(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={submitting || files.length === 0}
                >
                  {submitting ? 'Uploading...' : 'Confirm Submission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
