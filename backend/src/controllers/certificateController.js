const mongoose = require('mongoose');
const Certificate = require('../models/Certificate');
const User = require('../models/User');
const pdfService = require('../services/pdfService');
const { clientUrl } = require('../config/clientUrl');
const audit = require('../services/auditService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const {
  assertStudentAccess,
  scopeQueryToStudents,
} = require('../utils/studentAccess');
const { parentsOfStudent } = require('../utils/parentLookup');
const {
  sendEmail,
  emailTemplates,
} = require('../services/notificationService');
const { enqueueEmail } = require('../services/jobQueue');

const getCertificateNotificationRecipients = async (certificate) => {
  await certificate.populate({
    path: 'student',
    select: 'firstName lastName email studentProfile.parentId',
  });

  const student = certificate.student;
  if (!student?.email) return [];

  const recipients = [
    {
      name: `${student.firstName} ${student.lastName}`,
      email: student.email,
    },
  ];

  const parents = await parentsOfStudent(student);
  parents
    .filter((parent) => parent.email)
    .forEach((parent) =>
      recipients.push({
        name: `${parent.firstName} ${parent.lastName}`,
        email: parent.email,
      }),
    );

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

// A document with the school's name on it left the building. Only revocation
// used to be recorded, so the log could say one was withdrawn but not who issued
// it. The student is the subject, so it appears in their history.
const auditIssue = (req, certificate) =>
  audit.record(req, {
    action: 'certificate.issue',
    entity: 'Certificate',
    entityId: certificate._id,
    entityLabel: certificate.certificateType,
    subject: certificate.student?._id || certificate.student,
    meta: {
      certificateNumber: certificate.certificateNumber,
      term: certificate.term,
      academicYear: certificate.academicYear,
    },
  });

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
    // The portal, not the file: the document is only served to someone signed
    // in and entitled to it, so a link in an email must never be the file.
    downloadUrl: clientUrl(),
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
    helpUrl: clientUrl(),
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
    pdfData: pdfData.buffer,
    pdfSize: pdfData.buffer.length,
    issuedBy: req.user._id,
    status: 'Issued',
  });

  await certificate.populate('student', 'firstName lastName studentProfile');
  await auditIssue(req, certificate);

  notifyCertificateIssued(certificate).catch((err) =>
    console.error('Certificate issuance notification failed:', err.message),
  );

  sendSuccess(res, 201, 'Report card generated successfully', certificate);
};

// Generate School Leaving Certificate
exports.generateLeavingCertificate = async (req, res) => {
  const { studentId, data = {} } = req.body;

  const student = await resolveStudentIdentifier(studentId);
  if (!student || student.role !== 'Student') {
    return sendError(res, 404, 'Student not found');
  }

  // The record comes first because the certificate number is assigned when it
  // is saved, and the PDF has to print that number. It used to print whatever
  // `data.certificateNumber` the request carried — usually nothing, so the
  // document said "Certificate No: undefined" while the database held another.
  const certificate = await Certificate.create({
    certificateType: 'School Leaving Certificate',
    student: student._id,
    data,
    issuedBy: req.user._id,
    status: 'Draft',
  });

  let pdfData;
  try {
    pdfData = await pdfService.generateLeavingCertificate(student._id, {
      ...data,
      certificateNumber: certificate.certificateNumber,
    });
  } catch (error) {
    await certificate.deleteOne(); // no PDF, so no certificate
    throw error;
  }

  certificate.pdfData = pdfData.buffer;
  certificate.pdfSize = pdfData.buffer.length;
  certificate.status = 'Issued';
  await certificate.save();

  await certificate.populate('student', 'firstName lastName studentProfile');
  await auditIssue(req, certificate);

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
  const { studentId, data = {} } = req.body;

  const student = await resolveStudentIdentifier(studentId);
  if (!student || student.role !== 'Student') {
    return sendError(res, 404, 'Student not found');
  }

  // Record first, for the same reason as the leaving certificate: the PDF
  // prints the number the database assigns.
  const certificate = await Certificate.create({
    certificateType: 'Admission Letter',
    student: student._id,
    data,
    issuedBy: req.user._id,
    validUntil: data.validUntil,
    status: 'Draft',
  });

  let pdfData;
  try {
    pdfData = await pdfService.generateAdmissionLetter(student._id, {
      ...data,
      certificateNumber: certificate.certificateNumber,
    });
  } catch (error) {
    await certificate.deleteOne();
    throw error;
  }

  certificate.pdfData = pdfData.buffer;
  certificate.pdfSize = pdfData.buffer.length;
  certificate.status = 'Issued';
  await certificate.save();

  await certificate.populate('student', 'firstName lastName');
  await auditIssue(req, certificate);

  notifyCertificateIssued(certificate).catch((err) =>
    console.error('Certificate issuance notification failed:', err.message),
  );

  sendSuccess(res, 201, 'Admission letter generated successfully', certificate);
};

// Get all certificates (with filters)
exports.getAllCertificates = async (req, res) => {
  const { certificateType, student, academicYear } = req.query;
  const query = {};

  if (certificateType) query.certificateType = certificateType;
  if (student) query.student = student;
  if (academicYear) query.academicYear = academicYear;

  // This route carries no authorize(), so every signed-in account reaches it —
  // and it used to answer with every certificate in the school. A parent could
  // read another family's leaving certificate simply by opening the list.
  // Staff are unrestricted; a student is narrowed to themselves and a parent
  // to their own children.
  scopeQueryToStudents(query, req.user);

  const certificates = await Certificate.find(query)
    .populate('student', 'firstName lastName studentProfile')
    .populate('issuedBy', 'firstName lastName')
    .sort({ createdAt: -1 });

  // 200, not 201. Reading a list creates nothing, and a client checking for
  // 200 would treat this as a failure.
  sendSuccess(res, 200, 'Certificates retrieved successfully', certificates);
};

// Get certificate by ID
exports.getCertificateById = async (req, res) => {
  const certificate = await Certificate.findById(req.params.id)
    .populate('student', 'firstName lastName studentProfile')
    .populate('class', 'name level')
    .populate('issuedBy', 'firstName lastName');

  if (!certificate) {
    return sendError(res, 404, 'Certificate not found');
  }

  // Fetched first, then checked: the ownership question is about the student
  // on the certificate, which is not knowable from the id in the URL.
  assertStudentAccess(
    req.user,
    certificate.student?._id || certificate.student,
    'certificates',
  );

  sendSuccess(res, 200, 'Certificate retrieved successfully', certificate);
};

// Revoke certificate
exports.revokeCertificate = async (req, res) => {
  const { revokeReason } = req.body;

  const certificate = await Certificate.findById(req.params.id);

  if (!certificate) {
    return sendError(res, 404, 'Certificate not found');
  }

  certificate.status = 'Revoked';
  certificate.revokedAt = new Date();
  certificate.revokedBy = req.user._id;
  certificate.revokeReason = revokeReason;

  await certificate.save();

  notifyCertificateRevoked(certificate).catch((err) =>
    console.error('Certificate revocation notification failed:', err.message),
  );

  await audit.record(req, {
    action: 'certificate.revoke',
    entity: 'Certificate',
    entityId: certificate._id,
    entityLabel: certificate.certificateType,
    subject: certificate.student,
    meta: {
      certificateNumber: certificate.certificateNumber,
      revokeReason,
    },
    reason: revokeReason,
  });

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

// @desc    Download a certificate's PDF
// @route   GET /api/v1/certificates/:id/download
// @access  Admin, Teacher, the student it belongs to, that student's parent
//
// The only way to obtain the document. It used to be a public Cloudinary URL,
// so anyone holding the link — forwarded email, browser history, a shared
// screenshot — could read a child's report card, and revoking a certificate
// left the file open for ever. Here the same ownership rule as everywhere else
// applies on every request, and a revoked certificate stops being served.
exports.downloadCertificate = async (req, res) => {
  const certificate = await Certificate.findById(req.params.id).select(
    '+pdfData',
  );

  if (!certificate) {
    return sendError(res, 404, 'Certificate not found');
  }

  assertStudentAccess(req.user, certificate.student, 'certificates');

  const isAdmin = req.user.role === 'Admin';

  // A draft is not an issued document, and a revoked one is not valid. Admins
  // may still open either, to see what was issued.
  if (certificate.status === 'Draft' && !isAdmin) {
    return sendError(res, 404, 'Certificate not found');
  }
  if (certificate.status === 'Revoked' && !isAdmin) {
    return sendError(res, 403, 'This certificate has been revoked.');
  }

  if (!certificate.pdfData || !certificate.pdfData.length) {
    // Issued before documents were stored in the portal. See
    // utils/migrateCertificatePdfs.js, or regenerate it.
    return sendError(
      res,
      404,
      'This document is not available for download. Ask an administrator to regenerate it.',
    );
  }

  const filename = String(certificate.certificateNumber || certificate._id)
    .replace(/[^\w.-]+/g, '_')
    .concat('.pdf');

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${filename}"`,
    'Content-Length': certificate.pdfData.length,
    // A child's record must not sit in a shared browser or proxy cache.
    'Cache-Control': 'private, no-store',
  });

  return res.send(Buffer.from(certificate.pdfData));
};
