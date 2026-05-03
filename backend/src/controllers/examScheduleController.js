const examScheduleService = require('../services/examScheduleService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Create exam schedule
exports.createSchedule = async (req, res) => {
  try {
    const schedule = await examScheduleService.createSchedule(
      req.body,
      req.user._id,
    );
    sendSuccess(res, schedule, 'Exam schedule created successfully', 201);
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Get all schedules
exports.getSchedules = async (req, res) => {
  try {
    const schedules = await examScheduleService.getSchedules(req.query);
    sendSuccess(res, schedules, 'Schedules retrieved successfully');
  } catch (error) {
    sendError(res, error.message, 500);
  }
};

// Get schedule by ID
exports.getScheduleById = async (req, res) => {
  try {
    const schedule = await examScheduleService.getScheduleById(req.params.id);
    sendSuccess(res, schedule, 'Schedule retrieved successfully');
  } catch (error) {
    sendError(res, error.message, 404);
  }
};

// Update schedule
exports.updateSchedule = async (req, res) => {
  try {
    const schedule = await examScheduleService.updateSchedule(
      req.params.id,
      req.body,
    );
    sendSuccess(res, schedule, 'Schedule updated successfully');
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Publish schedule
exports.publishSchedule = async (req, res) => {
  try {
    const schedule = await examScheduleService.publishSchedule(
      req.params.id,
      req.user._id,
    );
    sendSuccess(res, schedule, 'Schedule published and notifications sent');
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Get teacher invigilations
exports.getTeacherInvigilations = async (req, res) => {
  try {
    const schedules = await examScheduleService.getTeacherInvigilations(
      req.user._id,
      req.query,
    );
    sendSuccess(res, schedules, 'Invigilation schedule retrieved successfully');
  } catch (error) {
    sendError(res, error.message, 500);
  }
};

// Delete schedule
exports.deleteSchedule = async (req, res) => {
  try {
    const result = await examScheduleService.deleteSchedule(req.params.id);
    sendSuccess(res, result, 'Schedule deleted successfully');
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Check conflicts
exports.checkConflicts = async (req, res) => {
  try {
    const { classId, date, startTime, endTime, excludeScheduleId } = req.body;
    const conflicts = await examScheduleService.checkConflicts(
      classId,
      date,
      startTime,
      endTime,
      excludeScheduleId,
    );
    sendSuccess(
      res,
      { conflicts, hasConflicts: conflicts.length > 0 },
      'Conflict check completed',
    );
  } catch (error) {
    sendError(res, error.message, 500);
  }
};
