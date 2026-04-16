import React, { useEffect, useState } from 'react';
import { Upload, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { assignmentService, submissionService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function StudentAssignments() {
  const { user } = useAuthStore();
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitModal, setSubmitModal] = useState(null);
  const [files, setFiles] = useState([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      assignmentService.getAll({ classId: user?.studentProfile?.class?._id }),
      submissionService.getMine(),
    ]).then(([aRes, sRes]) => {
      setAssignments(aRes.data.data || []);
      const sMap = {};
      (sRes.data.data?.submissions || []).forEach(s => { sMap[s.assignment?._id] = s; });
      setSubmissions(sMap);
    }).catch(() => toast.error('Failed to load assignments'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submissionService.submit({ assignmentId: submitModal._id, comment, files });
      toast.success('Assignment submitted!');
      setSubmitModal(null);
      setFiles([]); setComment('');
      const sRes = await submissionService.getMine();
      const sMap = {};
      (sRes.data.data?.submissions || []).forEach(s => { sMap[s.assignment?._id] = s; });
      setSubmissions(sMap);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-header__title">Assignments</h1><p className="page-header__subtitle">{assignments.length} assignments</p></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {assignments.length === 0 ? (
          <div className="card"><div className="empty-state"><p className="empty-state__title">No assignments yet</p></div></div>
        ) : assignments.map(a => {
          const sub = submissions[a._id];
          const overdue = new Date() > new Date(a.dueDate);
          return (
            <div key={a._id} className="card">
              <div className="card__body" style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <h4 style={{ margin: 0 }}>{a.title}</h4>
                    {sub ? (
                      <span className={`badge badge--${sub.status === 'Graded' ? 'success' : 'info'}`}>{sub.status}</span>
                    ) : overdue ? (
                      <span className="badge badge--danger">Overdue</span>
                    ) : (
                      <span className="badge badge--warning">Pending</span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--clr-text-3)', marginBottom: 10 }}>{a.description}</p>
                  <div style={{ display: 'flex', gap: 16, fontSize: '0.8125rem', color: 'var(--clr-text-3)', flexWrap: 'wrap' }}>
                    <span><strong>Subject:</strong> {a.subject?.name}</span>
                    <span><strong>Max:</strong> {a.totalMarks} marks</span>
                    <span style={{ color: overdue ? 'var(--clr-danger)' : 'inherit' }}>
                      <Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      Due: {format(new Date(a.dueDate), 'dd MMM yyyy, h:mm a')}
                    </span>
                  </div>
                  {sub?.status === 'Graded' && (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: '#d1fae5', borderRadius: 8 }}>
                      <strong style={{ color: '#065f46' }}>Score: {sub.score}/{a.totalMarks}</strong>
                      {sub.feedback && <p style={{ margin: '4px 0 0', color: '#047857', fontSize: '0.875rem' }}>{sub.feedback}</p>}
                    </div>
                  )}
                </div>
                {!sub && !overdue && (
                  <button className="btn btn--primary" onClick={() => setSubmitModal(a)}>
                    <Upload size={15} /> Submit
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {submitModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSubmitModal(null)}>
          <div className="modal">
            <div className="modal__header">
              <h3 className="modal__title">Submit: {submitModal.title}</h3>
              <button className="btn btn--ghost btn--icon" onClick={() => setSubmitModal(null)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal__body">
                <div className="form-group">
                  <label>Upload Files</label>
                  <input type="file" multiple className="form-control" onChange={e => setFiles(Array.from(e.target.files))} />
                </div>
                <div className="form-group">
                  <label>Comment (optional)</label>
                  <textarea className="form-control" rows={3} value={comment} onChange={e => setComment(e.target.value)} />
                </div>
              </div>
              <div className="modal__footer">
                <button type="button" className="btn btn--secondary" onClick={() => setSubmitModal(null)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Assignment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
