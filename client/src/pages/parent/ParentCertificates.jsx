import React, { useState, useEffect } from 'react';
import { certificateService } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { Download, FileText, Calendar, Award, Users } from 'lucide-react';
import { format } from 'date-fns';

const ParentCertificates = () => {
  const { user } = useAuthStore();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      const response = await certificateService.getChildrenCertificates();
      setCertificates(response?.data?.data || []);
    } catch (error) {
      toast.error('Failed to load certificates');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getCertificateIcon = (type) => {
    switch (type) {
      case 'Report Card':
        return <FileText size={20} />;
      case 'School Leaving Certificate':
        return <Award size={20} />;
      case 'Admission Letter':
        return <Calendar size={20} />;
      default:
        return <FileText size={20} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Issued':
        return 'text-green-600 bg-green-50';
      case 'Revoked':
        return 'text-red-600 bg-red-50';
      case 'Draft':
        return 'text-yellow-600 bg-yellow-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  // Group certificates by child
  const certificatesByChild = certificates.reduce((acc, cert) => {
    const childId = cert.student._id;
    if (!acc[childId]) {
      acc[childId] = {
        child: cert.student,
        certificates: [],
      };
    }
    acc[childId].certificates.push(cert);
    return acc;
  }, {});

  const children = Object.values(certificatesByChild);

  return (
    <div className="parent-certificates-page">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Children's Certificates</h1>
          <p className="page-header__subtitle">
            View and download your children's academic certificates
          </p>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner" />
        </div>
      ) : children.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Users size={48} className="empty-state__icon" />
            <p className="empty-state__title">No Certificates Yet</p>
            <p className="empty-state__text">
              Your children's certificates will appear here once they are issued
              by the administration.
            </p>
          </div>
        </div>
      ) : (
        <div className="children-certificates">
          {children.map(({ child, certificates: childCerts }) => (
            <div key={child._id} className="child-section">
              <div className="child-header">
                <div className="child-info">
                  <h2>
                    {child.firstName} {child.lastName}
                  </h2>
                  <p className="child-class">
                    Class: {child.studentProfile?.class?.name || 'Not assigned'}
                  </p>
                </div>
                <div className="certificates-count">
                  {childCerts.length} certificate
                  {childCerts.length !== 1 ? 's' : ''}
                </div>
              </div>

              <div className="certificates-grid">
                {childCerts.map((cert) => (
                  <div key={cert._id} className="certificate-card">
                    <div className="certificate-header">
                      <div className="certificate-icon">
                        {getCertificateIcon(cert.certificateType)}
                      </div>
                      <div className="certificate-info">
                        <h3>{cert.certificateType}</h3>
                        <p className="certificate-number">
                          {cert.certificateNumber || 'Pending Number'}
                        </p>
                      </div>
                      <div
                        className={`status-badge ${getStatusColor(cert.status)}`}
                      >
                        {cert.status}
                      </div>
                    </div>

                    <div className="certificate-details">
                      {cert.term && (
                        <div className="detail-item">
                          <span className="label">Term:</span>
                          <span className="value">{cert.term}</span>
                        </div>
                      )}
                      {cert.academicYear && (
                        <div className="detail-item">
                          <span className="label">Academic Year:</span>
                          <span className="value">{cert.academicYear}</span>
                        </div>
                      )}
                      <div className="detail-item">
                        <span className="label">Issue Date:</span>
                        <span className="value">
                          {format(new Date(cert.issueDate), 'PPP')}
                        </span>
                      </div>
                      {cert.validUntil && (
                        <div className="detail-item">
                          <span className="label">Valid Until:</span>
                          <span className="value">
                            {format(new Date(cert.validUntil), 'PPP')}
                          </span>
                        </div>
                      )}
                      <div className="detail-item">
                        <span className="label">Issued By:</span>
                        <span className="value">
                          {cert.issuedBy?.firstName} {cert.issuedBy?.lastName}
                        </span>
                      </div>
                    </div>

                    <div className="certificate-actions">
                      {cert.pdfUrl && cert.status === 'Issued' && (
                        <a
                          href={cert.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary btn-sm"
                        >
                          <Download size={16} />
                          Download PDF
                        </a>
                      )}
                      {cert.status === 'Revoked' && (
                        <div className="revoked-notice">
                          <p className="text-red-600 text-sm">
                            This certificate has been revoked.
                          </p>
                          {cert.revokeReason && (
                            <p className="text-gray-600 text-xs">
                              Reason: {cert.revokeReason}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ParentCertificates;
