import React, { useEffect, useState } from 'react';
import { Users, TrendingUp, DollarSign, CalendarCheck } from 'lucide-react';
import { dashboardService } from '../../services/api';
import toast from 'react-hot-toast';

export default function ParentDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardService.getParent({ term: 'First Term', academicYear: '2024/2025' })
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" /></div>;
  const { childrenData = [], announcements = [] } = data || {};

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-header__title">Parent Dashboard</h1>
        <p className="page-header__subtitle">Monitor your children's academic progress</p></div>
      </div>
      {childrenData.length === 0 ? (
        <div className="card"><div className="empty-state"><Users size={48} className="empty-state__icon" /><p className="empty-state__title">No children linked</p><p className="empty-state__text">Contact admin to link your children's accounts</p></div></div>
      ) : childrenData.map(({ child, averageScore, attendance, latestResults, latestPayment }) => (
        <div key={child._id} className="card" style={{ marginBottom: 24 }}>
          <div className="card__header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#1e40af' }}>
                {child.firstName[0]}{child.lastName[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{child.firstName} {child.lastName}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--clr-text-3)' }}>{child.studentProfile?.class?.name} • {child.studentProfile?.admissionNumber}</div>
              </div>
            </div>
          </div>
          <div className="card__body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
              {[
                { label: 'Avg Score', value: averageScore ? `${averageScore}%` : '—', color: '#1A4FAB', icon: TrendingUp },
                { label: 'Attendance', value: `${attendance?.percentage || 0}%`, color: parseFloat(attendance?.percentage || 0) >= 75 ? '#10B981' : '#F59E0B', icon: CalendarCheck },
                { label: 'Fee Status', value: latestPayment?.status || 'N/A', color: latestPayment?.status === 'Paid' ? '#10B981' : '#F59E0B', icon: DollarSign },
              ].map(item => (
                <div key={item.label} style={{ padding: '16px', background: 'var(--clr-bg)', borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${item.color}` }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)', textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.375rem', fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            {latestResults?.length > 0 && (
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--clr-text-2)', marginBottom: 10 }}>Recent Subjects</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {latestResults.map(r => (
                    <div key={r._id} style={{ padding: '8px 14px', background: 'var(--clr-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--clr-border)', minWidth: 90 }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)' }}>{r.subject?.name}</div>
                      <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '1.125rem' }}>{r.totalScore}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
