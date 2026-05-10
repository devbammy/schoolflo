import React, { useState, useEffect, useMemo } from 'react';
import { resultService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import PrintableReportCard from '../../components/results/PrintableReportCard';
import { toast } from 'react-hot-toast';
import {
  Printer,
  Layout,
  FileText,
  Calendar,
  Award,
  ChevronDown,
  User,
} from 'lucide-react';
import {
  getCurrentAcademicYear,
  generateAcademicYearOptions,
} from '../../utils/academicYear';

const ViewResults = () => {
  const { user } = useAuthStore();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState('First Term');
  const [selectedYear, setSelectedYear] = useState(getCurrentAcademicYear());
  const [showPrintView, setShowPrintView] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState('');

  // Determine the student ID (handles Parent vs Student roles)
  const studentId = useMemo(() => {
    return user.role === 'Parent'
      ? selectedChildId ||
          user.parentProfile?.children[0]?._id ||
          user.parentProfile?.children[0]
      : user._id;
  }, [user, selectedChildId]);

  // Determine the student object for display (handles Parent vs Student roles)
  const displayStudent = useMemo(() => {
    if (user.role === 'Parent') {
      // Find the selected child from parent's children array
      const selectedChild = user.parentProfile?.children?.find(
        (child) => (child._id || child) === selectedChildId
      );
      return selectedChild || user.parentProfile?.children?.[0];
    }
    return user;
  }, [user, selectedChildId]);

  // Initialize selected child for parents
  useEffect(() => {
    if (
      user.role === 'Parent' &&
      user.parentProfile?.children?.length > 0 &&
      !selectedChildId
    ) {
      const firstChild = user.parentProfile.children[0];
      setSelectedChildId(firstChild._id || firstChild);
    }
  }, [user, selectedChildId]);

  useEffect(() => {
    fetchResults();
    // Close print view when filters change for a fresh look
    setShowPrintView(false);
  }, [selectedTerm, selectedYear, studentId]);

  const fetchResults = async () => {
    try {
      setLoading(true);

      const response = await resultService.getReportCard(studentId, {
        term: selectedTerm,
        academicYear: selectedYear,
      });

      setResults(response?.data?.data?.results || []);
    } catch (error) {
      // Handle empty result gracefully
      if (
        error?.response?.status === 404 ||
        error?.response?.data?.message?.toLowerCase().includes('not found') ||
        error?.response?.data?.message?.toLowerCase().includes('no result')
      ) {
        setResults([]);
        return;
      }

      toast.error('Failed to fetch results');
    } finally {
      setLoading(false);
    }
  };

  const gpa = useMemo(() => {
    if (!results.length) return 0;
    const total = results.reduce((sum, r) => sum + (r.totalScore || 0), 0);
    return (total / results.length).toFixed(2);
  }, [results]);

  return (
    <div className="view-results-container">
      <header className="results-header">
        <div className="header-text">
          <h1>Academic Report</h1>
          <p className="subtitle">
            Official term records and performance breakdown
          </p>
        </div>

        <div className="filter-bar">
          {user.role === 'Parent' &&
            user.parentProfile?.children?.length > 1 && (
              <div className="select-wrapper">
                <User size={16} />
                <select
                  value={selectedChildId}
                  onChange={(e) => setSelectedChildId(e.target.value)}
                >
                  {user.parentProfile.children.map((child) => (
                    <option key={child._id || child} value={child._id || child}>
                      {child.firstName} {child.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}

          <div className="select-wrapper">
            <Calendar size={16} />
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
            >
              <option value="First Term">First Term</option>
              <option value="Second Term">Second Term</option>
              <option value="Third Term">Third Term</option>
            </select>
          </div>

          <div className="select-wrapper">
            <User size={16} />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              {generateAcademicYearOptions(5).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <button
            className={`btn-action ${showPrintView ? 'view-mode' : 'print-mode'}`}
            onClick={() => setShowPrintView(!showPrintView)}
            disabled={results.length === 0 || loading}
          >
            {showPrintView ? (
              <>
                <Layout size={18} /> Table View
              </>
            ) : (
              <>
                <Printer size={18} /> Print View
              </>
            )}
          </button>
        </div>
      </header>

      {results.length > 0 && !showPrintView && (
        <div className="results-stats-strip">
          <div className="stat-pill">
            <Award size={18} className="text-primary" />
            <span>
              Average Score: <strong>{gpa}%</strong>
            </span>
          </div>
          <div className="stat-pill">
            <FileText size={18} className="text-secondary" />
            <span>
              Subjects: <strong>{results.length}</strong>
            </span>
          </div>
        </div>
      )}

      <main className="results-main">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading records...</p>
          </div>
        ) : !showPrintView ? (
          <div className="table-card">
            {results.length === 0 ? (
              <div className="empty-results">
                <div className="empty-icon">📂</div>
                <h3>No Results Published</h3>
                <p>
                  Records for {selectedTerm}, {selectedYear} haven't been
                  released yet.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th className="text-center">CA1</th>
                      <th className="text-center">CA2</th>
                      <th className="text-center">Mid-Term</th>
                      <th className="text-center">Exam</th>
                      <th className="text-center">Total</th>
                      <th className="text-center">Grade</th>
                      <th className="text-center">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => (
                      <tr key={result._id}>
                        <td className="subject-col">{result.subject?.name}</td>
                        <td className="text-center">{result.scores.ca1}</td>
                        <td className="text-center">{result.scores.ca2}</td>
                        <td className="text-center">{result.scores.midTerm}</td>
                        <td className="text-center">{result.scores.exam}</td>
                        <td className="text-center font-bold text-primary">
                          {result.totalScore}
                        </td>
                        <td className="text-center">
                          <span
                            className={`grade-tag grade-${result.grade?.toLowerCase()}`}
                          >
                            {result.grade}
                          </span>
                        </td>
                        <td className="text-center italic text-sm text-gray">
                          {result.remark}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="print-section-wrapper anim-fade-in">
            <PrintableReportCard
              student={displayStudent}
              results={results}
              term={selectedTerm}
              academicYear={selectedYear}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default ViewResults;
