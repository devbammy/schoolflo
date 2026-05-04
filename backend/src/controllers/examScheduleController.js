const examScheduleService = require('../services/examScheduleService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Create exam schedule
exports.createSchedule = async (req, res) => {
  try {
    const schedule = await examScheduleService.createSchedule(
      req.body,
      req.user._id,
    );
    sendSuccess(res, 201, 'Exam schedule created successfully', schedule);
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Get all schedules
exports.getSchedules = async (req, res) => {
  try {
    const schedules = await examScheduleService.getSchedules(req.query);
    sendSuccess(res, 200, 'Schedules retrieved successfully', schedules);
  } catch (error) {
    sendError(res, error.message, 500);
  }
};

// Get schedule by ID
exports.getScheduleById = async (req, res) => {
  try {
    const schedule = await examScheduleService.getScheduleById(req.params.id);
    sendSuccess(res, 201, 'Schedule retrieved successfully', schedule);
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
    sendSuccess(res, 201, 'Schedule updated successfully', schedule);
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
    sendSuccess(
      res,
      201,
      'Schedule published and notifications sent',
      schedule,
    );
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
    sendSuccess(
      res,
      201,
      'Invigilation schedule retrieved successfully',
      schedules,
    );
  } catch (error) {
    sendError(res, error.message, 500);
  }
};

// Delete schedule
exports.deleteSchedule = async (req, res) => {
  try {
    const result = await examScheduleService.deleteSchedule(req.params.id);
    sendSuccess(res, 201, 'Schedule deleted successfully', result);
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
    sendSuccess(res, 201, 'Conflict check completed', {
      conflicts,
      hasConflicts: conflicts.length > 0,
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
};
