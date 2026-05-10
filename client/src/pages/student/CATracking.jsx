import React, { useState, useEffect } from 'react';
import { caTrackingService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { Line } from 'react-chartjs-2';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Award,
  AlertCircle,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import {
  getCurrentAcademicYear,
  generateAcademicYearOptions,
} from '../../utils/academicYear';

const CATracking = () => {
  const { user } = useAuthStore();

  const [tracking, setTracking] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());

  useEffect(() => {
    if (!user?._id) return;
    fetchTracking();
    fetchAnalytics();
  }, [academicYear, user?._id]);

  const fetchTracking = async () => {
    try {
      setLoading(true);

      const res = await caTrackingService.getStudentTracking(user._id, {
        academicYear,
      });

      setTracking(res?.data?.data || []);
    } catch (error) {
      toast.error('Failed to fetch tracking data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await caTrackingService.getAnalytics(user._id, {
        academicYear,
      });
      setAnalytics(res?.data?.data || null);
    } catch (error) {
      console.error('Analytics error:', error);
    }
  };

  const viewSubjectChart = async (subjectId) => {
    try {
      const res = await caTrackingService.getChartData(user._id, subjectId, {
        academicYear,
      });

      console.log(res.data.data);

      const subject = tracking.find((t) => t.subject?._id === subjectId);

      setSelectedSubject(subject || null);
      setChartData(res?.data?.data || null);
    } catch (error) {
      toast.error('Failed to load chart data');
    }
  };

  const getTrendUI = (trend) => {
    switch (trend) {
      case 'Improving':
        return {
          icon: <TrendingUp size={18} />,
          class: 'trend-up',
          label: 'Improving',
        };
      case 'Declining':
        return {
          icon: <TrendingDown size={18} />,
          class: 'trend-down',
          label: 'Declining',
        };
      case 'Stable':
        return {
          icon: <Minus size={18} />,
          class: 'trend-stable',
          label: 'Stable',
        };
      default:
        return {
          icon: <Activity size={18} />,
          class: 'trend-mixed',
          label: 'Inconsistent',
        };
    }
  };

  const getChartConfig = () => {
    if (!chartData) return null;

    return {
      labels: chartData.labels || [],
      datasets: [
        {
          label: selectedSubject?.subject?.name || 'Performance',
          data: chartData.values || chartData.datasets[0]?.data || [],
          borderColor: '#4f46e5',
          tension: 0.3,
        },
      ],
    };
  };

  const improvingCount =
    analytics?.trends?.improving ??
    analytics?.trendSummary?.improving ??
    analytics?.trends?.improvingSubjects?.length ??
    0;

  return (
    <div className="ca-container">
      {/* HEADER */}
      <header className="dashboard-header">
        <div>
          <h2>Academic Progress</h2>
          <p>Tracking Continuous Assessment for {user?.name}</p>
        </div>

        <div className="year-filter">
          <Calendar size={18} />
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          >
            {generateAcademicYearOptions().map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* ANALYTICS */}
      {analytics && (
        <section className="stats-grid">
          <div className="stat-card main">
            <label>Overall Average</label>
            <div className="value-group">
              <span className="big-number">
                {analytics?.overallAverage || 0}%
              </span>
              <Award className="icon-bg" />
            </div>
          </div>

          <div className="stat-card border-green">
            <label>Improving Subjects</label>
            <span className="count-val text-green">{improvingCount}</span>
            <TrendingUp size={24} />
          </div>

          <div className="stat-card border-red">
            <label>Needs Attention</label>
            <span className="count-val text-red">
              {analytics?.trends?.declining || 0}
            </span>
            <AlertCircle size={24} />
          </div>
        </section>
      )}

      {/* Empty State Logic before the main content layout */}
      {tracking.length === 0 && !loading && (
        <div className="empty-state">
          <Activity size={48} />
          <p>No assessment data found for the {academicYear} academic year.</p>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div className="content-layout">
        <main className="tracking-section">
          <h4 style={{ marginBottom: 20 }}>Subject Breakdown</h4>

          <div className="subject-cards">
            {tracking.map((tracker) => {
              const trend = getTrendUI(tracker.trend);

              return (
                <div key={tracker._id} className="subject-card">
                  <div className="card-top">
                    <h4>{tracker?.subject?.name}</h4>
                    <span className={`trend-pill ${trend.class}`}>
                      {trend.icon} {trend.label}
                    </span>
                  </div>

                  <div className="score-row">
                    <div className="score-circle">
                      <span className="score">
                        {tracker?.yearlyAverage || 0}%
                      </span>
                      <span className="label">Yearly Avg</span>
                    </div>
                    <div className="grade-box">
                      <span className="grade">
                        {tracker?.yearlyGrade || 'N/A'}
                      </span>
                      <span className="label">Final Grade</span>
                    </div>
                  </div>

                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>Term</th>
                        <th>Score</th>
                        <th>Pos.</th>
                        <th>+/-</th>
                      </tr>
                    </thead>

                    <tbody>
                      {(tracker.termRecords || []).map((record, idx) => (
                        <tr key={idx}>
                          <td>{record.term}</td>
                          <td>
                            <strong>{record.total}%</strong>
                          </td>
                          <td>#{record.position}</td>
                          <td
                            className={
                              record.improvement >= 0
                                ? 'text-green'
                                : 'text-red'
                            }
                          >
                            {record.improvement > 0
                              ? `+${record.improvement}`
                              : record.improvement}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <button
                    className="btn-view-chart"
                    onClick={() => viewSubjectChart(tracker?.subject?._id)}
                  >
                    Insights & Trends <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </main>

        {/* SIDEBAR */}
        {analytics && (
          <aside className="insights-sidebar">
            <div className="insight-box">
              <h4>
                <Award size={18} /> Top Performers
              </h4>

              {(analytics.bestPerformance || []).map((item, i) => (
                <div key={i} className="insight-item">
                  <span>{item.subject}</span>
                  <span className="badge-green">{item.average}%</span>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* CHART SECTION */}
      {chartData && selectedSubject && (
        <section className="chart-section">
          <div className="chart-header">
            <h3>{selectedSubject?.subject?.name} Performance Trend</h3>

            <button
              className="close-btn"
              onClick={() => {
                setChartData(null);
                setSelectedSubject(null);
              }}
            >
              Close
            </button>
          </div>

          <div className="chart-box">
            <Line
              data={getChartConfig()}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: true },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 100,
                  },
                },
              }}
            />
          </div>
        </section>
      )}
    </div>
  );
};

export default CATracking;
