const ExamSchedule = require('../models/ExamSchedule');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const User = require('../models/User');
const notificationService = require('./notificationService');
const AppError = require('../utils/AppError');

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
      { path: 'sessions.invigilator', select: 'firstName lastName email' },
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
      .populate('sessions.invigilator', 'firstName lastName email')
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
        'sessions.invigilator',
        'firstName lastName email teacherProfile',
      )
      .populate('createdBy', 'firstName lastName');

    if (!schedule) {
      throw AppError.notFound('Exam schedule not found');
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
      { path: 'sessions.invigilator', select: 'firstName lastName email' },
    ]);

    if (!schedule) {
      throw AppError.notFound('Exam schedule not found');
    }

    return schedule;
  }

  // Publish schedule (notify teachers and students)
  async publishSchedule(id, userId) {
    const schedule = await ExamSchedule.findById(id)
      .populate('class')
      .populate('sessions.subject')
      .populate('sessions.invigilator');

    if (!schedule) {
      throw AppError.notFound('Exam schedule not found');
    }

    if (schedule.isPublished) {
      throw AppError.conflict('Schedule already published');
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
    const invigilators = schedule.sessions
      .map((session) => session.invigilator)
      .filter(
        (inv, index, arr) =>
          inv && arr.findIndex((i) => i._id.equals(inv._id)) === index,
      );

    // Send email notifications

    return schedule;
  }

  // Get teacher's invigilation schedule
  async getTeacherInvigilations(teacherId, filters = {}) {
    const query = {
      'sessions.invigilator': teacherId,
    };

    if (filters.term) query.term = filters.term;
    if (filters.academicYear) {
      const filter = this._buildAcademicYearFilter(filters.academicYear);
      if (filter) query.academicYear = filter;
    }

    const schedules = await ExamSchedule.find(query)
      .populate('class', 'name level')
      .populate('sessions.subject', 'name code')
      .populate('sessions.invigilator', 'firstName lastName email')
      .sort({ 'sessions.date': 1 });

    // Filter sessions to only include those where teacher is invigilator
    const teacherSchedule = schedules
      .map((schedule) => {
        const relevantSessions = schedule.sessions.filter(
          (session) =>
            session.invigilator &&
            String(session.invigilator._id) === String(teacherId),
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
      throw AppError.notFound('Exam schedule not found');
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

  _buildAcademicYearFilter(value) {
    const year = String(value || '').trim();
    if (!year) return null;

    if (year.includes('/')) {
      const normalizedRange = year.replace(/\s*\/\s*/g, '/');
      const [startYear, endYear] = normalizedRange
        .split('/')
        .map((y) => y.trim())
        .filter(Boolean);
      const candidates = [normalizedRange];

      if (startYear) {
        candidates.push(startYear);
        candidates.push(new RegExp(`^${startYear}`));
      }
      if (endYear) {
        candidates.push(endYear);
        candidates.push(new RegExp(`^${endYear}`));
      }

      return { $in: candidates };
    }

    return { $in: [year, new RegExp(`^${year}`)] };
  }

  // Get exam schedules for a student (their class)
  async getStudentSchedules(studentId, filters = {}) {
    const student = await User.findById(studentId)
      .select('studentProfile')
      .populate('studentProfile.class', '_id');

    if (!student || !student.studentProfile?.class) {
      return [];
    }

    const classId = student.studentProfile.class._id;
    const query = {
      class: classId,
      isPublished: true,
    };

    if (filters.term) query.term = filters.term;
    if (filters.academicYear) {
      const academicYearFilter = this._buildAcademicYearFilter(
        filters.academicYear,
      );
      if (academicYearFilter) query.academicYear = academicYearFilter;
    }

    const schedules = await ExamSchedule.find(query)
      .populate('class', 'name level')
      .populate('sessions.subject', 'name code')
      .populate('sessions.invigilator', 'firstName lastName')
      .populate('createdBy', 'firstName lastName')
      .sort({ startDate: -1 });

    return schedules;
  }

  // Get exam schedules for a parent (their children's classes)
  async getParentSchedules(parentId, filters = {}) {
    const parent = await User.findById(parentId).populate(
      'parentProfile.children',
      'studentProfile',
    );

    if (!parent || !parent.parentProfile?.children?.length) {
      return [];
    }

    const classIds = parent.parentProfile.children
      .map((child) => child.studentProfile?.class)
      .filter(Boolean);

    if (!classIds.length) {
      return [];
    }

    const query = {
      class: { $in: classIds },
      isPublished: true,
    };

    if (filters.term) query.term = filters.term;
    if (filters.academicYear) {
      const academicYearFilter = this._buildAcademicYearFilter(
        filters.academicYear,
      );
      if (academicYearFilter) query.academicYear = academicYearFilter;
    }

    const schedules = await ExamSchedule.find(query)
      .populate('class', 'name level')
      .populate('sessions.subject', 'name code')
      .populate('sessions.invigilator', 'firstName lastName')
      .populate('createdBy', 'firstName lastName')
      .sort({ startDate: -1 });

    return schedules;
  }
}

module.exports = new ExamScheduleService();
