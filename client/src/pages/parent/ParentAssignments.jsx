import React, { useState, useEffect } from 'react';
import { parentService } from '../../services/api';
import toast from 'react-hot-toast';
import {
  Calendar,
  BookOpen,
  CheckCircle,
  Clock,
  AlertCircle,
  Star,
  Eye,
} from 'lucide-react';
import { format } from 'date-fns';
import './ParentAssignments.scss';

const ParentAssignments = () => {
  const [assignments, setAssignments] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, submitted, graded
  const [selectedChild, setSelectedChild] = useState('all');
  const [expandedAssignment, setExpandedAssignment] = useState(null);

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const response = await parentService.getChildrenAssignments();
      const data = response?.data?.data;
      setAssignments(data?.assignments || []);
      setChildren(data?.children || []);
    } catch (error) {
      toast.error('Failed to load assignments');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Filter assignments based on selected filters
  const filteredAssignments = assignments.filter((assignment) => {
    // Filter by status
    let statusMatch = true;
    if (filter !== 'all') {
      if (filter === 'pending') {
        statusMatch =
          assignment.isOverdue ||
          Object.values(assignment.childrenData).some(
            (d) => d.status === 'Not Submitted',
          );
      } else if (filter === 'submitted') {
        statusMatch = Object.values(assignment.childrenData).some(
          (d) => d.status === 'Submitted' || d.status === 'Late',
        );
      } else if (filter === 'graded') {
        statusMatch = Object.values(assignment.childrenData).some(
          (d) => d.status === 'Graded',
        );
      }
    }

    // Filter by child
    let childMatch = true;
    if (selectedChild !== 'all') {
      childMatch = assignment.childrenData[selectedChild] !== undefined;
    }

    return statusMatch && childMatch;
  });

  const getStatusBadgeClass = (status, isLate) => {
    if (status === 'Not Submitted') return 'badge-danger';
    if (status === 'Pending') return 'badge-warning';
    if (status === 'Late') return 'badge-warning';
    if (status === 'Submitted') return 'badge-info';
    if (status === 'Graded') return 'badge-success';
    return 'badge-secondary';
  };

  const getStatusIcon = (status) => {
    if (status === 'Not Submitted')
      return <AlertCircle size={16} className="text-danger" />;
    if (status === 'Late') return <Clock size={16} className="text-warning" />;
    if (status === 'Submitted')
      return <CheckCircle size={16} className="text-info" />;
    if (status === 'Graded') return <Star size={16} className="text-success" />;
    return null;
  };

  const isOverdue = (dueDate) => new Date() > new Date(dueDate);

  return (
    <div className="parent-assignments-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Assignments Tracker</h1>
          <p className="page-header__subtitle">
            Monitor your children's assignment submissions and grades
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <label>Children:</label>
          <select
            className="form-control"
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
          >
            <option value="all">All Children</option>
            {children.map((child) => (
              <option key={child._id} value={child._id}>
                {child.name} ({child.class})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Status:</label>
          <div className="button-group">
            {[
              { value: 'all', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'submitted', label: 'Submitted' },
              { value: 'graded', label: 'Graded' },
            ].map((option) => (
              <button
                key={option.value}
                className={`btn btn-sm ${
                  filter === option.value ? 'btn--primary' : 'btn--secondary'
                }`}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-screen">
          <div className="spinner" />
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredAssignments.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <BookOpen size={48} className="empty-state__icon" />
            <p className="empty-state__title">No Assignments Found</p>
            <p className="empty-state__text">
              {children.length === 0
                ? 'You have no children linked to your account.'
                : 'No assignments match your filter criteria.'}
            </p>
          </div>
        </div>
      )}

      {/* Assignments List */}
      {!loading && filteredAssignments.length > 0 && (
        <div className="assignments-list">
          {filteredAssignments.map((assignment) => (
            <div
              key={assignment._id}
              className={`assignment-card ${
                isOverdue(assignment.dueDate) &&
                !Object.values(assignment.childrenData).every(
                  (d) => d.status === 'Graded',
                )
                  ? 'overdue'
                  : ''
              }`}
            >
              {/* Header */}
              <div className="assignment-header">
                <div className="assignment-title-section">
                  <h3>{assignment.title}</h3>
                  <div className="assignment-meta">
                    <span className="badge badge-primary">
                      {assignment.subject?.name}
                    </span>
                    <span className="badge badge-secondary">
                      {assignment.class?.name}
                    </span>
                  </div>
                </div>
                <button
                  className="btn-expand"
                  onClick={() =>
                    setExpandedAssignment(
                      expandedAssignment === assignment._id
                        ? null
                        : assignment._id,
                    )
                  }
                >
                  <Eye size={18} />
                </button>
              </div>

              {/* Due Date */}
              <div className="assignment-due-date">
                <Calendar size={16} />
                <span>
                  Due:{' '}
                  {format(new Date(assignment.dueDate), 'EEE, MMM dd, yyyy')}
                  {isOverdue(assignment.dueDate) && (
                    <span className="overdue-tag">Overdue</span>
                  )}
                </span>
              </div>

              {/* Children Submissions Grid */}
              <div className="children-submissions-grid">
                {children
                  .filter(
                    (child) =>
                      selectedChild === 'all' || child._id === selectedChild,
                  )
                  .map((child) => {
                    const submission = assignment.childrenData[child._id] || {
                      status: 'Not Submitted',
                      submittedAt: null,
                      isLate: false,
                      score: null,
                      feedback: null,
                    };

                    return (
                      <div key={child._id} className="submission-card">
                        <p className="child-name">{child.name}</p>

                        {/* Status Badge */}
                        <div className="status-section">
                          <div
                            className={`badge ${getStatusBadgeClass(
                              submission.status,
                              submission.isLate,
                            )}`}
                          >
                            {getStatusIcon(submission.status)}
                            <span>{submission.status}</span>
                          </div>

                          {submission.isLate &&
                            submission.status !== 'Graded' && (
                              <span className="late-indicator">Late</span>
                            )}
                        </div>

                        {/* Submission Date */}
                        {submission.submittedAt && (
                          <p className="submission-date">
                            Submitted:{' '}
                            {format(new Date(submission.submittedAt), 'MMM dd')}
                          </p>
                        )}

                        {/* Score */}
                        {submission.score !== null && (
                          <div className="score-section">
                            <p className="score-label">Score</p>
                            <p className="score-value">
                              {submission.score}/{assignment.totalMarks}
                            </p>
                          </div>
                        )}

                        {/* Feedback (expandable) */}
                        {submission.feedback &&
                          expandedAssignment === assignment._id && (
                            <div className="feedback-section">
                              <p className="feedback-label">Teacher Feedback</p>
                              <p className="feedback-text">
                                {submission.feedback}
                              </p>
                            </div>
                          )}
                      </div>
                    );
                  })}
              </div>

              {/* Assignment Description (expandable) */}
              {expandedAssignment === assignment._id && (
                <div className="assignment-description">
                  <p className="description-label">Assignment Details</p>
                  <p className="description-text">{assignment.description}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ParentAssignments;
