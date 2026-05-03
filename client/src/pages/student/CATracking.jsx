import React, { useState, useEffect } from 'react';
import { caTrackingService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import { Line } from 'react-chartjs-2';
import { toast } from 'react-hot-toast';

const CATracking = () => {
  const { user } = useAuthStore();
  const [tracking, setTracking] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [academicYear, setAcademicYear] = useState(
    new Date().getFullYear().toString(),
  );

  useEffect(() => {
    fetchTracking();
    fetchAnalytics();
  }, [academicYear]);

  const fetchTracking = async () => {
    try {
      setLoading(true);
      const response = await caTrackingService.getStudentTracking(user._id, {
        academicYear,
      });
      setTracking(response.data.data);
    } catch (error) {
      toast.error('Failed to fetch tracking data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await caTrackingService.getAnalytics(user._id, {
        academicYear,
      });
      setAnalytics(response.data.data);
    } catch (error) {
      console.error('Failed to fetch analytics');
    }
  };

  const viewSubjectChart = async (subjectId) => {
    try {
      const response = await caTrackingService.getChartData(
        user._id,
        subjectId,
        {
          academicYear,
        },
      );
      setChartData(response.data.data);
      setSelectedSubject(tracking.find((t) => t.subject._id === subjectId));
    } catch (error) {
      toast.error('Failed to load chart data');
    }
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'Improving':
        return '📈';
      case 'Declining':
        return '📉';
      case 'Stable':
        return '➡️';
      case 'Inconsistent':
        return '↕️';
      default:
        return '';
    }
  };

  const getTrendClass = (trend) => {
    switch (trend) {
      case 'Improving':
        return 'trend-improving';
      case 'Declining':
        return 'trend-declining';
      case 'Stable':
        return 'trend-stable';
      default:
        return 'trend-inconsistent';
    }
  };

  return (
    <div className="ca-tracking-page">
      <div className="page-header">
        <h1>Continuous Assessment Tracking</h1>
        <select
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          className="year-selector"
        >
          <option value={(new Date().getFullYear() - 1).toString()}>
            {new Date().getFullYear() - 1}
          </option>
          <option value={new Date().getFullYear().toString()}>
            {new Date().getFullYear()}
          </option>
          <option value={(new Date().getFullYear() + 1).toString()}>
            {new Date().getFullYear() + 1}
          </option>
        </select>
      </div>

      {loading && <div className="loading-spinner">Loading...</div>}

      {/* Analytics Summary */}
      {analytics && (
        <div className="analytics-summary">
          <div className="summary-card">
            <h3>Overall Average</h3>
            <p className="big-number">{analytics.overallAverage}%</p>
          </div>
          <div className="summary-card">
            <h3>Total Subjects</h3>
            <p className="big-number">{analytics.totalSubjects}</p>
          </div>
          <div className="summary-card">
            <h3>Improving</h3>
            <p className="big-number trend-improving">
              {analytics.trends.improving}
            </p>
          </div>
          <div className="summary-card">
            <h3>Needs Attention</h3>
            <p className="big-number trend-declining">
              {analytics.trends.declining}
            </p>
          </div>
        </div>
      )}

      {/* Best & Worst Performance */}
      {analytics && (
        <div className="performance-insights">
          <div className="insight-card">
            <h3>Top Performance</h3>
            {analytics.bestPerformance.map((item, index) => (
              <div key={index} className="performance-item">
                <span>{item.subject}</span>
                <span className="performance-score">{item.average}%</span>
              </div>
            ))}
          </div>

          <div className="insight-card">
            <h3>Needs Attention</h3>
            {analytics.needsAttention.map((item, index) => (
              <div key={index} className="performance-item">
                <span>{item.subject}</span>
                <span className="performance-score warning">
                  {item.average}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subject-wise Tracking */}
      <div className="tracking-grid">
        {tracking.map((tracker) => (
          <div key={tracker._id} className="tracking-card">
            <div className="card-header">
              <h3>{tracker.subject.name}</h3>
              <span className={`trend-badge ${getTrendClass(tracker.trend)}`}>
                {getTrendIcon(tracker.trend)} {tracker.trend}
              </span>
            </div>

            <div className="card-stats">
              <div className="stat">
                <label>Yearly Average</label>
                <p className="stat-value">{tracker.yearlyAverage}%</p>
              </div>
              <div className="stat">
                <label>Grade</label>
                <p className="stat-value">{tracker.yearlyGrade}</p>
              </div>
            </div>

            {/* Term-by-term breakdown */}
            <div className="term-records">
              <table>
                <thead>
                  <tr>
                    <th>Term</th>
                    <th>Score</th>
                    <th>Grade</th>
                    <th>Position</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {tracker.termRecords.map((record, index) => (
                    <tr key={index}>
                      <td>{record.term}</td>
                      <td>{record.total}%</td>
                      <td>{record.grade}</td>
                      <td>{record.position}</td>
                      <td
                        className={
                          record.improvement > 0
                            ? 'positive'
                            : record.improvement < 0
                              ? 'negative'
                              : ''
                        }
                      >
                        {record.improvement > 0 ? '+' : ''}
                        {record.improvement}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              className="btn btn-sm btn-secondary"
              onClick={() => viewSubjectChart(tracker.subject._id)}
            >
              View Chart
            </button>
          </div>
        ))}
      </div>

      {/* Chart Modal */}
      {chartData && selectedSubject && (
        <div className="modal-overlay" onClick={() => setChartData(null)}>
          <div
            className="modal-content chart-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>{selectedSubject.subject.name} - Performance Trend</h2>
              <button className="close-btn" onClick={() => setChartData(null)}>
                ×
              </button>
            </div>

            <div className="chart-container">
              <Line
                data={{
                  labels: chartData.labels,
                  datasets: chartData.datasets,
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 100,
                    },
                  },
                }}
              />
            </div>

            <div className="trend-summary">
              <p>
                <strong>Trend:</strong> {selectedSubject.trend}
              </p>
              <p>
                <strong>Yearly Average:</strong> {selectedSubject.yearlyAverage}
                %
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CATracking;
