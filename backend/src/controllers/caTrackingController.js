const caTrackingService = require('../services/caTrackingService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Sync CA tracker with published results
exports.syncTrackers = async (req, res) => {
  try {
    const { studentId, academicYear } = req.body;
    const trackers = await caTrackingService.syncFromResults(
      studentId,
      academicYear,
    );
    sendSuccess(res, 200, 'CA trackers synced successfully', trackers);
  } catch (error) {
    sendError(res, error.message, 500);
  }
};

// Get student's CA tracking
exports.getStudentTracking = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear } = req.query;

    const trackers = await caTrackingService.getStudentTracking(
      studentId,
      academicYear,
    );
    sendSuccess(res, 200, 'Student tracking retrieved successfully', trackers);
  } catch (error) {
    sendError(res, error.message, 500);
  }
};

// Get class tracking for a subject
exports.getClassTracking = async (req, res) => {
  try {
    const { classId, subjectId } = req.params;
    const { academicYear } = req.query;

    const tracking = await caTrackingService.getClassTracking(
      classId,
      subjectId,
      academicYear,
    );
    sendSuccess(res, 200, 'Class tracking retrieved successfully', tracking);
  } catch (error) {
    sendError(res, error.message, 500);
  }
};

// Get student analytics
exports.getStudentAnalytics = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear } = req.query;

    const analytics = await caTrackingService.getStudentAnalytics(
      studentId,
      academicYear,
    );
    sendSuccess(res, 200, 'Analytics retrieved successfully', analytics);
  } catch (error) {
    sendError(res, error.message, 500);
  }
};

// Get chart data for visualization
exports.getChartData = async (req, res) => {
  try {
    const { studentId, subjectId } = req.params;
    const { academicYear } = req.query;

    const chartData = await caTrackingService.generateChartData(
      studentId,
      subjectId,
      academicYear,
    );
    sendSuccess(res, 200, 'Chart data retrieved successfully', chartData);
  } catch (error) {
    sendError(res, error.message, 500);
  }
};
