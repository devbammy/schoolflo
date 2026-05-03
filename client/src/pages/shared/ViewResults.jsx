import React, { useState, useEffect } from 'react';
import { resultService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import PrintableReportCard from '../../components/results/PrintableReportCard';
import { toast } from 'react-hot-toast';

const ViewResults = () => {
  const { user } = useAuthStore();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState('First Term');
  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear().toString(),
  );
  const [showPrintView, setShowPrintView] = useState(false);

  useEffect(() => {
    fetchResults();
  }, [selectedTerm, selectedYear]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      const studentId =
        user.role === 'Parent' ? user.parentProfile.children[0] : user._id;

      const response = await resultService.getStudentResults(studentId, {
        term: selectedTerm,
        academicYear: selectedYear,
      });

      setResults(response.data.data);
    } catch (error) {
      toast.error('Failed to fetch results');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="view-results-page">
      <div className="page-header">
        <h1>Academic Results</h1>
        <div className="filters">
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
          >
            <option value="First Term">First Term</option>
            <option value="Second Term">Second Term</option>
            <option value="Third Term">Third Term</option>
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value={(new Date().getFullYear() - 1).toString()}>
              {new Date().getFullYear() - 1}
            </option>
            <option value={new Date().getFullYear().toString()}>
              {new Date().getFullYear()}
            </option>
          </select>
          <button
            className="btn btn-primary"
            onClick={() => setShowPrintView(!showPrintView)}
            disabled={results.length === 0}
          >
            {showPrintView ? '📋 View Table' : '🖨️ Print View'}
          </button>
        </div>
      </div>

      {loading && <div className="loading-spinner">Loading...</div>}

      {!showPrintView ? (
        // Table View
        <div className="results-table-view">
          {results.length === 0 ? (
            <div className="no-results">
              <p>
                No published results for {selectedTerm}, {selectedYear}
              </p>
            </div>
          ) : (
            <table className="results-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>CA1</th>
                  <th>CA2</th>
                  <th>Mid-Term</th>
                  <th>Exam</th>
                  <th>Total</th>
                  <th>Grade</th>
                  <th>Position</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result._id}>
                    <td>{result.subject?.name}</td>
                    <td>{result.scores.ca1}</td>
                    <td>{result.scores.ca2}</td>
                    <td>{result.scores.midTerm}</td>
                    <td>{result.scores.exam}</td>
                    <td>
                      <strong>{result.totalScore}</strong>
                    </td>
                    <td>
                      <strong>{result.grade}</strong>
                    </td>
                    <td>{result.position}</td>
                    <td>{result.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        // Print View
        <PrintableReportCard
          student={user}
          results={results}
          term={selectedTerm}
          academicYear={selectedYear}
        />
      )}
    </div>
  );
};

export default ViewResults;
