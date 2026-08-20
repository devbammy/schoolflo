const examScheduleService = require('../services/examScheduleService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Create exam schedule
exports.createSchedule = async (req, res) => {
  const schedule = await examScheduleService.createSchedule(
    req.body,
    req.user._id,
  );
  sendSuccess(res, 201, 'Exam schedule created successfully', schedule);
};

// Get all schedules
exports.getSchedules = async (req, res) => {
  const schedules = await examScheduleService.getSchedules(req.query);
  sendSuccess(res, 200, 'Schedules retrieved successfully', schedules);
};

// Get schedule by ID
exports.getScheduleById = async (req, res) => {
  const schedule = await examScheduleService.getScheduleById(req.params.id);
  sendSuccess(res, 201, 'Schedule retrieved successfully', schedule);
};

// Update schedule
exports.updateSchedule = async (req, res) => {
  const schedule = await examScheduleService.updateSchedule(
    req.params.id,
    req.body,
  );
  sendSuccess(res, 201, 'Schedule updated successfully', schedule);
};

// Publish schedule
exports.publishSchedule = async (req, res) => {
  const schedule = await examScheduleService.publishSchedule(
    req.params.id,
    req.user._id,
  );
  sendSuccess(res, 201, 'Schedule published and notifications sent', schedule);
};

// Get teacher invigilations
exports.getTeacherInvigilations = async (req, res) => {
  const schedules = await examScheduleService.getTeacherInvigilations(
    req.user._id,
    req.query,
  );
  sendSuccess(res, 200, 'Invigilation schedule retrieved successfully', {
    schedules,
  });
};

// Delete schedule
exports.deleteSchedule = async (req, res) => {
  const result = await examScheduleService.deleteSchedule(req.params.id);
  sendSuccess(res, 201, 'Schedule deleted successfully', result);
};

// Check conflicts
exports.checkConflicts = async (req, res) => {
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
};

// Get exam schedules for student (their class)
exports.getStudentSchedules = async (req, res) => {
  const schedules = await examScheduleService.getStudentSchedules(
    req.user._id,
    req.query,
  );

  sendSuccess(res, 200, 'Student exam schedules retrieved', { schedules });
};

// Get exam schedules for parent (their children's classes)
exports.getParentSchedules = async (req, res) => {
  const schedules = await examScheduleService.getParentSchedules(
    req.user._id,
    req.query,
  );

  sendSuccess(res, 200, 'Parent exam schedules retrieved', { schedules });
};
