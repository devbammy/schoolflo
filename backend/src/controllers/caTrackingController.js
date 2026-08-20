const caTrackingService = require('../services/caTrackingService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Sync CA tracker with published results
exports.syncTrackers = async (req, res) => {
  const { studentId, academicYear } = req.body;
  const trackers = await caTrackingService.syncFromResults(
    studentId,
    academicYear,
  );
  sendSuccess(res, 200, 'CA trackers synced successfully', trackers);
};

// Get student's CA tracking
exports.getStudentTracking = async (req, res) => {
  const { studentId } = req.params;
  const { academicYear } = req.query;

  const trackers = await caTrackingService.getStudentTracking(
    studentId,
    academicYear,
  );
  sendSuccess(res, 200, 'Student tracking retrieved successfully', trackers);
};

// Get class tracking for a subject
exports.getClassTracking = async (req, res) => {
  const { classId, subjectId } = req.params;
  const { academicYear } = req.query;

  const tracking = await caTrackingService.getClassTracking(
    classId,
    subjectId,
    academicYear,
  );
  sendSuccess(res, 200, 'Class tracking retrieved successfully', tracking);
};

// Get student analytics
exports.getStudentAnalytics = async (req, res) => {
  const { studentId } = req.params;
  const { academicYear } = req.query;

  const analytics = await caTrackingService.getStudentAnalytics(
    studentId,
    academicYear,
  );
  sendSuccess(res, 200, 'Analytics retrieved successfully', analytics);
};

// Get chart data for visualization
exports.getChartData = async (req, res) => {
  const { studentId, subjectId } = req.params;
  const { academicYear } = req.query;

  const chartData = await caTrackingService.generateChartData(
    studentId,
    subjectId,
    academicYear,
  );
  sendSuccess(res, 200, 'Chart data retrieved successfully', chartData);
};

// Bulk sync CA trackers for entire class
exports.syncClassTrackers = async (req, res) => {
  const { classId, academicYear } = req.body;
  const result = await caTrackingService.syncClassTrackers(
    classId,
    academicYear,
  );
  sendSuccess(res, 200, 'Class CA trackers synced successfully', result);
};
