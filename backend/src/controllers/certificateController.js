const mongoose = require('mongoose');
const Certificate = require('../models/Certificate');
const User = require('../models/User');
const pdfService = require('../services/pdfService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const {
  sendEmail,
  emailTemplates,
} = require('../services/notificationService');
const { enqueueEmail } = require('../services/jobQueue');

const getCertificateNotificationRecipients = async (certificate) => {
  await certificate.populate({
    path: 'student',
    select: 'firstName lastName email studentProfile.parentId',
    populate: {
      path: 'studentProfile.parentId',
      select: 'firstName lastName email',
    },
  });

  const student = certificate.student;
  if (!student?.email) return [];

  const recipients = [
    {
      name: `${student.firstName} ${student.lastName}`,
      email: student.email,
    },
  ];

  const parent = student.studentProfile?.parentId;
  if (parent?.email) {
    recipients.push({
      name: `${parent.firstName} ${parent.lastName}`,
      email: parent.email,
    });
  }

  return recipients;
};

const resolveStudentIdentifier = async (identifier) => {
  if (!identifier) return null;
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    const student = await User.findById(identifier);
    if (student) return student;
  }
  return await User.findOne({ 'studentProfile.admissionNumber': identifier });
};

const notifyCertificateIssued = async (certificate) => {
  await certificate.populate('issuedBy', 'firstName lastName');

  const recipients = await getCertificateNotificationRecipients(certificate);
  if (!recipients.length) return;

  const payload = {
    studentName: `${certificate.student.firstName} ${certificate.student.lastName}`,
    certificateType: certificate.certificateType,
    certificateNumber: certificate.certificateNumber || 'N/A',
    issueDate: new Date(certificate.issueDate).toLocaleDateString('en-NG', {
      dateStyle: 'long',
    }),
    downloadUrl: certificate.pdfUrl || process.env.CLIENT_URL,
    issuerName: certificate.issuedBy
      ? `${certificate.issuedBy.firstName} ${certificate.issuedBy.lastName}`
      : 'School Administration',
  };

  await Promise.all(
    recipients.map((recipient) =>
      enqueueEmail({
        to: recipient.email,
        subject: `${certificate.certificateType} is ready`,
        html: emailTemplates.certificateIssued({
          ...payload,
          recipientName: recipient.name,
        }),
      }),
    ),
  );
};

const notifyCertificateRevoked = async (certificate) => {
  const recipients = await getCertificateNotificationRecipients(certificate);
  if (!recipients.length) return;

  const payload = {
    studentName: `${certificate.student.firstName} ${certificate.student.lastName}`,
    certificateType: certificate.certificateType,
    certificateNumber: certificate.certificateNumber || 'N/A',
    revokeReason: certificate.revokeReason || 'No reason provided',
    revokedAt: new Date(certificate.revokedAt || Date.now()).toLocaleDateString(
      'en-NG',
      {
        dateStyle: 'long',
      },
    ),
    helpUrl: process.env.CLIENT_URL,
  };

  await Promise.all(
    recipients.map((recipient) =>
      enqueueEmail({
        to: recipient.email,
        subject: `${certificate.certificateType} has been revoked`,
        html: emailTemplates.certificateRevoked({
          ...payload,
          recipientName: recipient.name,
        }),
      }),
    ),
  );
};

// Generate Report Card
exports.generateReportCard = async (req, res) => {
  const { studentId, term, academicYear } = req.body;

  const student = await resolveStudentIdentifier(studentId);
  if (!student || student.role !== 'Student') {
    return sendError(res, 404, 'Student not found');
  }

  // Generate PDF
  const pdfData = await pdfService.generateReportCard(
    student._id,
    term,
    academicYear,
  );

  // Save certificate record
  const certificate = await Certificate.create({
    certificateType: 'Report Card',
    student: student._id,
    term,
    academicYear,
    data: { term, academicYear },
    pdfUrl: pdfData.url,
    publicId: pdfData.publicId,
    issuedBy: req.user._id,
    status: 'Issued',
  });

  await certificate.populate('student', 'firstName lastName studentProfile');

  notifyCertificateIssued(certificate).catch((err) =>
    console.error('Certificate issuance notification failed:', err.message),
  );

  sendSuccess(res, 201, 'Report card generated successfully', certificate);
};

// Generate School Leaving Certificate
exports.generateLeavingCertificate = async (req, res) => {
  const { studentId, data } = req.body;

  const student = await resolveStudentIdentifier(studentId);
  if (!student || student.role !== 'Student') {
    return sendError(res, 404, 'Student not found');
  }

  // Generate PDF
  const pdfData = await pdfService.generateLeavingCertificate(
    student._id,
    data,
  );

  // Save certificate record
  const certificate = await Certificate.create({
    certificateType: 'School Leaving Certificate',
    student: student._id,
    data,
    pdfUrl: pdfData.url,
    publicId: pdfData.publicId,
    issuedBy: req.user._id,
    status: 'Issued',
  });

  await certificate.populate('student', 'firstName lastName studentProfile');

  notifyCertificateIssued(certificate).catch((err) =>
    console.error('Certificate issuance notification failed:', err.message),
  );

  sendSuccess(
    res,
    201,
    'Leaving certificate generated successfully',
    certificate,
  );
};

// Generate Admission Letter
exports.generateAdmissionLetter = async (req, res) => {
  const { studentId, data } = req.body;

  const student = await resolveStudentIdentifier(studentId);
  if (!student || student.role !== 'Student') {
    return sendError(res, 404, 'Student not found');
  }

  // Generate PDF
  const pdfData = await pdfService.generateAdmissionLetter(student._id, data);

  // Save certificate record
  const certificate = await Certificate.create({
    certificateType: 'Admission Letter',
    student: student._id,
    data,
    pdfUrl: pdfData.url,
    publicId: pdfData.publicId,
    issuedBy: req.user._id,
    validUntil: data.validUntil,
    status: 'Issued',
  });

  await certificate.populate('student', 'firstName lastName');

  notifyCertificateIssued(certificate).catch((err) =>
    console.error('Certificate issuance notification failed:', err.message),
  );

  sendSuccess(
    res,
    201,
    'Admission letter generated successfully',
    certificate,
  );
};

// Get all certificates (with filters)
exports.getAllCertificates = async (req, res) => {
  const { certificateType, student, academicYear } = req.query;
  const query = {};

  if (certificateType) query.certificateType = certificateType;
  if (student) query.student = student;
  if (academicYear) query.academicYear = academicYear;

  const certificates = await Certificate.find(query)
    .populate('student', 'firstName lastName studentProfile')
    .populate('issuedBy', 'firstName lastName')
    .sort({ createdAt: -1 });

  sendSuccess(res, 201, 'Certificates retrieved successfully', certificates);
};

// Get certificate by ID
exports.getCertificateById = async (req, res) => {
  const certificate = await Certificate.findById(req.params.id)
    .populate('student', 'firstName lastName studentProfile')
    .populate('class', 'name level')
    .populate('issuedBy', 'firstName lastName');

  if (!certificate) {
    return sendError(res, 'Certificate not found', 404);
  }

  sendSuccess(res, 201, 'Certificate retrieved successfully', certificate);
};

// Revoke certificate
exports.revokeCertificate = async (req, res) => {
  const { revokeReason } = req.body;

  const certificate = await Certificate.findById(req.params.id);

  if (!certificate) {
    return sendError(res, 'Certificate not found', 404);
  }

  certificate.status = 'Revoked';
  certificate.revokedAt = new Date();
  certificate.revokedBy = req.user._id;
  certificate.revokeReason = revokeReason;

  await certificate.save();

  notifyCertificateRevoked(certificate).catch((err) =>
    console.error('Certificate revocation notification failed:', err.message),
  );

  sendSuccess(res, 201, 'Certificate revoked successfully', certificate);
};

// @desc    The signed-in student's own certificates
// @route   GET /api/v1/certificates/student/my-certificates
// @access  Student
exports.getMyCertificates = async (req, res) => {
  const certificates = await Certificate.find({
    student: req.user._id,
    status: { $ne: 'Revoked' },
  })
    .populate('issuedBy', 'firstName lastName')
    .sort({ createdAt: -1 });

  sendSuccess(res, 200, 'Student certificates retrieved', certificates);
};

// @desc    Certificates belonging to the caller's children
// @route   GET /api/v1/certificates/parent/children-certificates
// @access  Parent
exports.getChildrenCertificates = async (req, res) => {
  const parent = await User.findById(req.user._id).populate(
    'parentProfile.children',
  );

  const children = parent?.parentProfile?.children || [];
  if (!children.length) {
    return sendSuccess(res, 200, 'No children found', { certificates: [] });
  }

  const childrenIds = children.map((child) => child._id);

  const certificates = await Certificate.find({
    student: { $in: childrenIds },
    status: { $ne: 'Revoked' },
  })
    .populate({
      path: 'student',
      select: 'firstName lastName studentProfile',
      populate: { path: 'studentProfile.class', select: 'name level' },
    })
    .populate('issuedBy', 'firstName lastName')
    .sort({ createdAt: -1 });

  sendSuccess(res, 200, 'Children certificates retrieved', certificates);
};
