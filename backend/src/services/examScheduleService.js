const ExamSchedule = require('../models/ExamSchedule');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const User = require('../models/User');
const notificationService = require('./notificationService');

class ExamScheduleService {
  // Create exam schedule
  async createSchedule(data, userId) {
    const schedule = await ExamSchedule.create({
      ...data,
      createdBy: userId,
    });

    await schedule.populate([
      { path: 'class', select: 'name level' },
      { path: 'sessions.subject', select: 'name code' },
      { path: 'sessions.invigilators', select: 'firstName lastName email' },
      { path: 'createdBy', select: 'firstName lastName' },
    ]);

    return schedule;
  }

  // Get all schedules with filters
  async getSchedules(filters = {}) {
    const query = {};

    if (filters.class) query.class = filters.class;
    if (filters.term) query.term = filters.term;
    if (filters.academicYear) query.academicYear = filters.academicYear;
    if (filters.examType) query.examType = filters.examType;

    const schedules = await ExamSchedule.find(query)
      .populate('class', 'name level')
      .populate('sessions.subject', 'name code')
      .populate('sessions.invigilators', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName')
      .sort({ startDate: -1 });

    return schedules;
  }

  // Get schedule by ID
  async getScheduleById(id) {
    const schedule = await ExamSchedule.findById(id)
      .populate('class', 'name level sections')
      .populate('sessions.subject', 'name code creditUnit')
      .populate(
        'sessions.invigilators',
        'firstName lastName email teacherProfile',
      )
      .populate('createdBy', 'firstName lastName');

    if (!schedule) {
      throw new Error('Exam schedule not found');
    }

    return schedule;
  }

  // Update schedule
  async updateSchedule(id, data) {
    const schedule = await ExamSchedule.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).populate([
      { path: 'class', select: 'name level' },
      { path: 'sessions.subject', select: 'name code' },
      { path: 'sessions.invigilators', select: 'firstName lastName email' },
    ]);

    if (!schedule) {
      throw new Error('Exam schedule not found');
    }

    return schedule;
  }

  // Publish schedule (notify teachers and students)
  async publishSchedule(id, userId) {
    const schedule = await ExamSchedule.findById(id)
      .populate('class')
      .populate('sessions.subject')
      .populate('sessions.invigilators');

    if (!schedule) {
      throw new Error('Exam schedule not found');
    }

    if (schedule.isPublished) {
      throw new Error('Schedule already published');
    }

    schedule.isPublished = true;
    schedule.publishedAt = new Date();
    await schedule.save();

    // Notify all students in the class
    const students = await User.find({
      role: 'Student',
      'studentProfile.class': schedule.class._id,
      isActive: true,
    });

    // Notify all invigilators
    const invigilators = [];
    schedule.sessions.forEach((session) => {
      session.invigilators.forEach((inv) => {
        if (!invigilators.some((i) => i._id.equals(inv._id))) {
          invigilators.push(inv);
        }
      });
    });

    // Send email notifications
    const emailPromises = [
      ...students.map((student) =>
        notificationService.sendEmail({
          to: student.email,
          subject: `${schedule.examType} Schedule Published - ${schedule.title}`,
          template: 'examSchedulePublished',
          data: {
            studentName: `${student.firstName} ${student.lastName}`,
            examTitle: schedule.title,
            examType: schedule.examType,
            className: schedule.class.name,
            startDate: schedule.startDate.toLocaleDateString('en-NG'),
            endDate: schedule.endDate.toLocaleDateString('en-NG'),
            loginUrl: process.env.CLIENT_URL,
          },
        }),
      ),
      ...invigilators.map((teacher) =>
        notificationService.sendEmail({
          to: teacher.email,
          subject: `Invigilation Assignment - ${schedule.title}`,
          template: 'invigilationAssignment',
          data: {
            teacherName: `${teacher.firstName} ${teacher.lastName}`,
            examTitle: schedule.title,
            className: schedule.class.name,
            sessionsCount: schedule.sessions.filter((s) =>
              s.invigilators.some((i) => i._id.equals(teacher._id)),
            ).length,
            loginUrl: process.env.CLIENT_URL,
          },
        }),
      ),
    ];

    await Promise.allSettled(emailPromises);

    return schedule;
  }

  // Get teacher's invigilation schedule
  async getTeacherInvigilations(teacherId, filters = {}) {
    const query = {
      'sessions.invigilators': teacherId,
    };

    if (filters.term) query.term = filters.term;
    if (filters.academicYear) query.academicYear = filters.academicYear;

    const schedules = await ExamSchedule.find(query)
      .populate('class', 'name level')
      .populate('sessions.subject', 'name code')
      .sort({ 'sessions.date': 1 });

    // Filter sessions to only include those where teacher is invigilator
    const teacherSchedule = schedules
      .map((schedule) => {
        const relevantSessions = schedule.sessions.filter((session) =>
          session.invigilators.some((inv) => inv._id.equals(teacherId)),
        );

        return {
          ...schedule.toObject(),
          sessions: relevantSessions,
        };
      })
      .filter((schedule) => schedule.sessions.length > 0);

    return teacherSchedule;
  }

  // Delete schedule
  async deleteSchedule(id) {
    const schedule = await ExamSchedule.findById(id);

    if (!schedule) {
      throw new Error('Exam schedule not found');
    }

    if (schedule.isPublished) {
      throw new Error('Cannot delete published schedule');
    }

    await schedule.deleteOne();
    return { message: 'Schedule deleted successfully' };
  }

  // Check for scheduling conflicts
  async checkConflicts(
    classId,
    date,
    startTime,
    endTime,
    excludeScheduleId = null,
  ) {
    const query = {
      class: classId,
      'sessions.date': date,
      _id: { $ne: excludeScheduleId },
    };

    const existingSchedules = await ExamSchedule.find(query);

    const conflicts = [];
    existingSchedules.forEach((schedule) => {
      schedule.sessions.forEach((session) => {
        if (session.date.toDateString() === new Date(date).toDateString()) {
          // Simple time overlap check
          if (
            this._timeOverlaps(
              startTime,
              endTime,
              session.startTime,
              session.endTime,
            )
          ) {
            conflicts.push({
              schedule: schedule.title,
              subject: session.subject,
              time: `${session.startTime} - ${session.endTime}`,
            });
          }
        }
      });
    });

    return conflicts;
  }

  _timeOverlaps(start1, end1, start2, end2) {
    // Convert time strings to comparable format (24h)
    const s1 = this._timeToMinutes(start1);
    const e1 = this._timeToMinutes(end1);
    const s2 = this._timeToMinutes(start2);
    const e2 = this._timeToMinutes(end2);

    return s1 < e2 && e1 > s2;
  }

  _timeToMinutes(timeStr) {
    const [time, period] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }
}

module.exports = new ExamScheduleService();
