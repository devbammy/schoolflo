import React, { useState, useEffect } from 'react';
import { caTrackingService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import { Line } from 'react-chartjs-2';
import { toast } from 'react-hot-toast';
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

  // ... (fetchTracking and fetchAnalytics stay the same)

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

  return (
    <div className="ca-container">
      <header className="dashboard-header">
        <div>
          <h1>Academic Progress</h1>
          <p>Tracking Continuous Assessment for {user.name}</p>
        </div>
        <div className="year-filter">
          <Calendar size={18} />
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
          >
            <option value="2024">2024/2025</option>
            <option value="2023">2023/2024</option>
          </select>
        </div>
      </header>

      {analytics && (
        <section className="stats-grid">
          <div className="stat-card main">
            <label>Overall Average</label>
            <div className="value-group">
              <span className="big-number">{analytics.overallAverage}%</span>
              <Award className="icon-bg" />
            </div>
            <div className="progress-bar-sm">
              <div
                className="fill"
                style={{ width: `${analytics.overallAverage}%` }}
              ></div>
            </div>
          </div>
          <div className="stat-card border-green">
            <label>Improving Subjects</label>
            <span className="count-val text-green">
              {analytics.trends.improving}
            </span>
            <TrendingUp size={24} className="icon-fade" />
          </div>
          <div className="stat-card border-red">
            <label>Needs Attention</label>
            <span className="count-val text-red">
              {analytics.trends.declining}
            </span>
            <AlertCircle size={24} className="icon-fade" />
          </div>
        </section>
      )}

      <div className="content-layout">
        <main className="tracking-section">
          <h3>Subject Breakdown</h3>
          <div className="subject-cards">
            {tracking.map((tracker) => {
              const trend = getTrendUI(tracker.trend);
              return (
                <div key={tracker._id} className="subject-card">
                  <div className="card-top">
                    <h4>{tracker.subject.name}</h4>
                    <span className={`trend-pill ${trend.class}`}>
                      {trend.icon} {trend.label}
                    </span>
                  </div>

                  <div className="score-row">
                    <div className="score-circle">
                      <span className="score">{tracker.yearlyAverage}%</span>
                      <span className="label">Average</span>
                    </div>
                    <div className="grade-box">
                      <span className="grade">{tracker.yearlyGrade}</span>
                      <span className="label">Grade</span>
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
                      {tracker.termRecords.map((record, idx) => (
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
                    onClick={() => viewSubjectChart(tracker.subject._id)}
                  >
                    Insights & Trends <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </main>

        {analytics && (
          <aside className="insights-sidebar">
            <div className="insight-box">
              <h4>
                <Award size={18} /> Top Performers
              </h4>
              {analytics.bestPerformance.map((item, i) => (
                <div key={i} className="insight-item">
                  <span>{item.subject}</span>
                  <span className="badge-green">{item.average}%</span>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
