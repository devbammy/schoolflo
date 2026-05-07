const Certificate = require('../models/Certificate');
const pdfService = require('../services/pdfService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Generate Report Card
exports.generateReportCard = async (req, res) => {
  try {
    const { studentId, term, academicYear } = req.body;

    // Generate PDF
    const pdfData = await pdfService.generateReportCard(
      studentId,
      term,
      academicYear,
    );

    // Save certificate record
    const certificate = await Certificate.create({
      certificateType: 'Report Card',
      student: studentId,
      term,
      academicYear,
      data: { term, academicYear },
      pdfUrl: pdfData.url,
      publicId: pdfData.publicId,
      issuedBy: req.user._id,
      status: 'Issued',
    });

    await certificate.populate('student', 'firstName lastName studentProfile');

    sendSuccess(res, 201, 'Report card generated successfully', certificate);
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Generate School Leaving Certificate
exports.generateLeavingCertificate = async (req, res) => {
  try {
    const { studentId, data } = req.body;

    // Generate PDF
    const pdfData = await pdfService.generateLeavingCertificate(
      studentId,
      data,
    );

    // Save certificate record
    const certificate = await Certificate.create({
      certificateType: 'School Leaving Certificate',
      student: studentId,
      data,
      pdfUrl: pdfData.url,
      publicId: pdfData.publicId,
      issuedBy: req.user._id,
      status: 'Issued',
    });

    await certificate.populate('student', 'firstName lastName studentProfile');

    sendSuccess(
      res,
      201,
      'Leaving certificate generated successfully',
      certificate,
    );
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Generate Admission Letter
exports.generateAdmissionLetter = async (req, res) => {
  try {
    const { studentId, data } = req.body;

    // Generate PDF
    const pdfData = await pdfService.generateAdmissionLetter(studentId, data);

    // Save certificate record
    const certificate = await Certificate.create({
      certificateType: 'Admission Letter',
      student: studentId,
      data,
      pdfUrl: pdfData.url,
      publicId: pdfData.publicId,
      issuedBy: req.user._id,
      validUntil: data.validUntil,
      status: 'Issued',
    });

    await certificate.populate('student', 'firstName lastName');

    console.log(certificate);

    sendSuccess(
      res,
      201,
      'Admission letter generated successfully',
      certificate,
    );
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Get all certificates (with filters)
exports.getAllCertificates = async (req, res) => {
  try {
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
  } catch (error) {
    sendError(res, error.message, 500);
  }
};

// Get certificate by ID
exports.getCertificateById = async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id)
      .populate('student', 'firstName lastName studentProfile')
      .populate('class', 'name level')
      .populate('issuedBy', 'firstName lastName');

    if (!certificate) {
      return sendError(res, 'Certificate not found', 404);
    }

    sendSuccess(res, 201, 'Certificate retrieved successfully', certificate);
  } catch (error) {
    sendError(res, error.message, 500);
  }
};

// Revoke certificate
exports.revokeCertificate = async (req, res) => {
  try {
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

    sendSuccess(res, 201, 'Certificate revoked successfully', certificate);
  } catch (error) {
    sendError(res, error.message, 400);
  }
};
