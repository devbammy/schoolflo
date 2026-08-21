import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import './PrintableReportCard.scss';

const PrintableReportCard = ({ student, results, term, academicYear }) => {
  const componentRef = useRef(null);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `${student.firstName}_${student.lastName}_${term}_${academicYear}`,
  });

  // Calculate summary statistics
  const totalScore = results.reduce((sum, r) => sum + r.totalScore, 0);
  const average = (totalScore / results.length).toFixed(2);
  const totalGradePoints = results.reduce((sum, r) => sum + r.gradePoint, 0);
  const gpa = (totalGradePoints / results.length).toFixed(2);

  const getPrincipalComment = (avg) => {
    if (avg >= 70)
      return 'Excellent performance. Keep up the outstanding work!';
    if (avg >= 60) return 'Very good performance. You are doing well.';
    if (avg >= 50) return 'Good performance. Work harder for better results.';
    if (avg >= 40)
      return 'Fair performance. Significant improvement is needed.';
    return 'Poor performance. Urgent attention required.';
  };

  return (
    <div>
      <button className="btn btn-primary print-btn" onClick={handlePrint}>
        🖨️ Print Report Card
      </button>

      <div ref={componentRef} className="printable-report-card">
        {/* Header */}
        <div className="report-header">
          <div className="school-logo">
            {/* Add your school logo here */}
            <div className="logo-placeholder">LOGO</div>
          </div>
          <div className="school-info">
            <h1>SCHOOL NAME HERE</h1>
            <p>School Address, City, State</p>
            <p>Tel: +234-XXX-XXX-XXXX | Email: info@school.ng</p>
          </div>
        </div>

        <hr className="header-divider" />

        {/* Title */}
        <h2 className="report-title">STUDENT REPORT CARD</h2>

        {/* Student Information */}
        <div className="student-info-box">
          <h3>Student Information</h3>
          <div className="info-grid">
            <div className="info-item">
              <label>Name:</label>
              <span>
                {student.firstName} {student.lastName}
              </span>
            </div>
            <div className="info-item">
              <label>Admission No:</label>
              <span>{student.studentProfile?.admissionNumber}</span>
            </div>
            <div className="info-item">
              <label>Class:</label>
              <span>{student.studentProfile?.class?.name}</span>
            </div>
            <div className="info-item">
              <label>Term:</label>
              <span>{term}</span>
            </div>
            <div className="info-item">
              <label>Academic Year:</label>
              <span>{academicYear}</span>
            </div>
            <div className="info-item">
              <label>Date:</label>
              <span>{new Date().toLocaleDateString('en-NG')}</span>
            </div>
          </div>
        </div>

        {/* Results Table */}
        <h3 className="section-title">Academic Performance</h3>
        <table className="results-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>1st CA</th>
              <th>2nd CA</th>
              <th>Class Work</th>
              <th>Project</th>
              <th>Exam</th>
              <th>Total</th>
              <th>Grade</th>
              <th>Position</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => (
              <tr key={index}>
                <td>{result.subject?.name}</td>
                <td>{result.scores.ca1}</td>
                <td>{result.scores.ca2}</td>
                <td>{result.scores.classWork}</td>
                <td>{result.scores.project}</td>
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

        {/* Summary */}
        <div className="summary-section">
          <h3>Summary</h3>
          <div className="summary-grid">
            <div className="summary-item">
              <label>Total Subjects:</label>
              <span>{results.length}</span>
            </div>
            <div className="summary-item">
              <label>Overall Average:</label>
              <span>{average}%</span>
            </div>
            <div className="summary-item">
              <label>GPA:</label>
              <span>{gpa}/5.0</span>
            </div>
          </div>
        </div>

        {/* Principal's Comment */}
        <div className="comment-section">
          <h4>Principal's Comment:</h4>
          <p>{getPrincipalComment(parseFloat(average))}</p>
        </div>

        {/* Grading Scale */}
        <div className="grading-scale">
          <h4>Grading Scale</h4>
          <p className="scale-text">
            A: 70-100 (Distinction) | B: 60-69 (Credit) | C: 50-59 (Merit) | D:
            45-49 (Pass) | E: 40-44 (Weak Pass) | F: 0-39 (Fail)
          </p>
        </div>

        {/* Signatures */}
        <div className="signature-section">
          <div className="signature-block">
            <div className="signature-line"></div>
            <p>Class Teacher</p>
          </div>
          <div className="signature-block">
            <div className="signature-line"></div>
            <p>Principal's Signature</p>
          </div>
        </div>

        {/* Footer */}
        <div className="report-footer">
          <p>Generated on {new Date().toLocaleString('en-NG')}</p>
        </div>
      </div>
    </div>
  );
};

export default PrintableReportCard;
