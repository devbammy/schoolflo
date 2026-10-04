import React, { useState, useEffect } from 'react';
import { certificateService } from '../../services/api';
import { downloadCertificate } from '../../utils/downloadCertificate';
import { toast } from 'react-hot-toast';
import Modal from '../../components/common/Modal';
import {
  generateAcademicYearOptions,
  getCurrentAcademicYear,
} from '../../utils/academicYear';

const Certificates = () => {
  const [certificates, setcertificates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [certificateType, setCertificateType] = useState('Report Card');
  const [saving, setSaving] = useState(false);

  const academicYears = generateAcademicYearOptions({
    count: 3,
    includeFuture: true,
  });

  // Form states for different certificate types
  const [reportCardData, setReportCardData] = useState({
    studentId: '',
    term: 'First Term',
    academicYear: getCurrentAcademicYear(),
  });

  const [leavingCertData, setLeavingCertData] = useState({
    studentId: '',
    admissionDate: '',
    leavingDate: '',
    character: 'Excellent',
    conduct: 'Very Good',
    reasonForLeaving: 'Completion of Studies',
  });

  const [admissionLetterData, setAdmissionLetterData] = useState({
    studentId: '',
    admissionNumber: '',
    className: '',
    academicYear: getCurrentAcademicYear(),
    resumptionDate: '',
    fees: '',
    validUntil: '',
    address: '',
    city: '',
  });

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      const response = await certificateService.getAll();
      setcertificates(response.data.data);
    } catch (error) {
      toast.error('Failed to fetch certificates');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);

    try {
      let response;
      switch (certificateType) {
        case 'Report Card':
          response =
            await certificateService.generateReportCard(reportCardData);
          break;
        case 'School Leaving Certificate':
          response = await certificateService.generateLeavingCertificate({
            studentId: leavingCertData.studentId,
            data: { ...leavingCertData },
          });
          break;
        case 'Admission Letter':
          response = await certificateService.generateAdmissionLetter({
            studentId: admissionLetterData.studentId,
            data: { ...admissionLetterData },
          });

          break;
        default:
          throw new Error('Invalid certificate type');
      }

      toast.success('Certificate generated successfully');
      setModal(null);
      resetForms();
      fetchCertificates();

    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to generate certificate',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id) => {
    const reason = window.prompt('Enter reason for revoking this certificate:');
    if (!reason) return;

    try {
      setLoading(true);
      await certificateService.revoke(id, { revokeReason: reason });
      toast.success('Certificate revoked successfully');
      fetchCertificates();
    } catch (error) {
      toast.error('Failed to revoke certificate');
    } finally {
      setLoading(false);
    }
  };

  const resetForms = () => {
    setReportCardData({
      studentId: '',
      term: 'First Term',
      academicYear: getCurrentAcademicYear(),
    });
    setLeavingCertData({
      studentId: '',
      admissionDate: '',
      leavingDate: '',
      character: 'Excellent',
      conduct: 'Very Good',
      reasonForLeaving: 'Completion of Studies',
    });
    setAdmissionLetterData({
      studentId: '',
      admissionNumber: '',
      className: '',
      academicYear: getCurrentAcademicYear(),
      resumptionDate: '',
      fees: '',
      validUntil: '',
      address: '',
      city: '',
    });
  };

  return (
    <div className="certificates-page">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Certificate Management</h1>
          <p className="page-header__subtitle">
            {certificates.length} records found
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setModal('generate')}
        >
          Generate Certificate
        </button>
      </div>

      {loading && <div className="loading-spinner">Loading...</div>}

      {/* Certificates List */}
      <div className="certificates-grid">
        {certificates.map((cert) => (
          <div key={cert._id} className="certificate-card">
            <div className="cert-header">
              <h3>{cert.certificateType}</h3>
              <span
                className={`status-badge status-${cert.status.toLowerCase()}`}
              >
                {cert.status}
              </span>
            </div>

            <div className="cert-details">
              <p>
                <strong>Certificate No:</strong> {cert.certificateNumber}
              </p>
              <p>
                <strong>Student:</strong> {cert.student?.firstName}{' '}
                {cert.student?.lastName}
              </p>
              {cert.term && (
                <p>
                  <strong>Term:</strong> {cert.term}
                </p>
              )}
              {cert.academicYear && (
                <p>
                  <strong>Year:</strong> {cert.academicYear}
                </p>
              )}
              <p>
                <strong>Issued:</strong>{' '}
                {new Date(cert.issueDate).toLocaleDateString('en-NG')}
              </p>
              <p>
                <strong>Issued By:</strong> {cert.issuedBy?.firstName}{' '}
                {cert.issuedBy?.lastName}
              </p>
            </div>

            <div className="cert-actions">
              {cert.hasPdf && (
                <button
                  type="button"
                  onClick={() => downloadCertificate(cert)}
                  className="btn btn-sm btn-secondary"
                >
                  Download PDF
                </button>
              )}
              {cert.status === 'Issued' && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleRevoke(cert._id)}
                >
                  Revoke
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Generate Certificate Modal */}
      <Modal
        open={modal === 'generate'}
        onClose={() => {
          setModal(null);
          resetForms();
        }}
        title="Generate Certificate"
        maxWidth={600}
        footer={
          <>
            <button
              className="btn btn--secondary"
              onClick={() => {
                setModal(null);
                resetForms();
              }}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              disabled={saving}
              onClick={handleGenerate}
            >
              {saving ? 'Generating...' : 'Generate Certificate'}
            </button>
          </>
        }
      >
        <form onSubmit={handleGenerate}>
          <div className="form-group">
            <label>Certificate Type *</label>
            <select
              className="form-control"
              value={certificateType}
              onChange={(e) => setCertificateType(e.target.value)}
            >
              <option value="Report Card">Report Card</option>
              <option value="School Leaving Certificate">
                School Leaving Certificate
              </option>
              <option value="Admission Letter">Admission Letter</option>
            </select>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            {certificateType === 'Report Card' && (
              <>
                <div className="form-group">
                  <label>Student Admission Number or ObjectId *</label>
                  <input
                    className="form-control"
                    type="text"
                    value={reportCardData.studentId}
                    onChange={(e) =>
                      setReportCardData({
                        ...reportCardData,
                        studentId: e.target.value,
                      })
                    }
                    placeholder="Enter student admission number or ObjectId"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Term *</label>
                  <select
                    className="form-control"
                    value={reportCardData.term}
                    onChange={(e) =>
                      setReportCardData({
                        ...reportCardData,
                        term: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="First Term">First Term</option>
                    <option value="Second Term">Second Term</option>
                    <option value="Third Term">Third Term</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Academic Year *</label>

                  <select
                    className="form-control"
                    value={reportCardData.academicYear}
                    onChange={(e) =>
                      setReportCardData({
                        ...reportCardData,
                        academicYear: e.target.value,
                      })
                    }
                    required
                  >
                    {academicYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {certificateType === 'School Leaving Certificate' && (
              <>
                <div className="form-group">
                  <label>Student Admission Number or ObjectId *</label>
                  <input
                    className="form-control"
                    type="text"
                    value={leavingCertData.studentId}
                    onChange={(e) =>
                      setLeavingCertData({
                        ...leavingCertData,
                        studentId: e.target.value,
                      })
                    }
                    placeholder="Enter student admission number or ObjectId"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Admission Date *</label>
                  <input
                    className="form-control"
                    type="date"
                    value={leavingCertData.admissionDate}
                    onChange={(e) =>
                      setLeavingCertData({
                        ...leavingCertData,
                        admissionDate: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Leaving Date *</label>
                  <input
                    className="form-control"
                    type="date"
                    value={leavingCertData.leavingDate}
                    onChange={(e) =>
                      setLeavingCertData({
                        ...leavingCertData,
                        leavingDate: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Character *</label>
                  <select
                    className="form-control"
                    value={leavingCertData.character}
                    onChange={(e) =>
                      setLeavingCertData({
                        ...leavingCertData,
                        character: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Very Good">Very Good</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Conduct *</label>
                  <select
                    className="form-control"
                    value={leavingCertData.conduct}
                    onChange={(e) =>
                      setLeavingCertData({
                        ...leavingCertData,
                        conduct: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Very Good">Very Good</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Reason for Leaving *</label>
                  <input
                    className="form-control"
                    type="text"
                    value={leavingCertData.reasonForLeaving}
                    onChange={(e) =>
                      setLeavingCertData({
                        ...leavingCertData,
                        reasonForLeaving: e.target.value,
                      })
                    }
                    required
                  />
                </div>
              </>
            )}

            {certificateType === 'Admission Letter' && (
              <>
                <div className="form-group">
                  <label>Student Admission Number or ObjectId *</label>
                  <input
                    className="form-control"
                    type="text"
                    value={admissionLetterData.studentId}
                    onChange={(e) =>
                      setAdmissionLetterData({
                        ...admissionLetterData,
                        studentId: e.target.value,
                      })
                    }
                    placeholder="Enter student admission number or ObjectId"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Admission Number *</label>
                  <input
                    className="form-control"
                    type="text"
                    value={admissionLetterData.admissionNumber}
                    onChange={(e) =>
                      setAdmissionLetterData({
                        ...admissionLetterData,
                        admissionNumber: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Class Name *</label>
                  <input
                    className="form-control"
                    type="text"
                    value={admissionLetterData.className}
                    onChange={(e) =>
                      setAdmissionLetterData({
                        ...admissionLetterData,
                        className: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Academic Year *</label>

                  <select
                    className="form-control"
                    value={admissionLetterData.academicYear}
                    onChange={(e) =>
                      setAdmissionLetterData({
                        ...admissionLetterData,
                        academicYear: e.target.value,
                      })
                    }
                    required
                  >
                    {academicYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Resumption Date *</label>
                  <input
                    className="form-control"
                    type="date"
                    value={admissionLetterData.resumptionDate}
                    onChange={(e) =>
                      setAdmissionLetterData({
                        ...admissionLetterData,
                        resumptionDate: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>School Fees (₦) *</label>
                  <input
                    className="form-control"
                    type="number"
                    value={admissionLetterData.fees}
                    onChange={(e) =>
                      setAdmissionLetterData({
                        ...admissionLetterData,
                        fees: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Valid Until *</label>
                  <input
                    className="form-control"
                    type="date"
                    value={admissionLetterData.validUntil}
                    onChange={(e) =>
                      setAdmissionLetterData({
                        ...admissionLetterData,
                        validUntil: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Student Address</label>
                  <input
                    className="form-control"
                    type="text"
                    value={admissionLetterData.address}
                    onChange={(e) =>
                      setAdmissionLetterData({
                        ...admissionLetterData,
                        address: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>City</label>
                  <input
                    className="form-control"
                    type="text"
                    value={admissionLetterData.city}
                    onChange={(e) =>
                      setAdmissionLetterData({
                        ...admissionLetterData,
                        city: e.target.value,
                      })
                    }
                  />
                </div>
              </>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Certificates;
