const Promotion = require('../models/Promotion');
const User = require('../models/User');
const CATracker = require('../models/CATracker');
const { Result } = require('../models/Exam');
const AppError = require('../utils/AppError');

class PromotionService {
  // Create promotion batch
  async createPromotionBatch(data, userId) {
    const promotion = await Promotion.create({
      ...data,
      createdBy: userId,
    });

    console.log(promotion);

    await promotion.populate([
      { path: 'fromClass', select: 'name level' },
      { path: 'toClass', select: 'name level' },
    ]);

    return promotion;
  }

  // Auto-process promotions based on criteria
  async autoProcessPromotion(promotionId, userId) {
    const promotion = await Promotion.findById(promotionId)
      .populate('fromClass')
      .populate('toClass')
      .populate('criteria.coreSubjects');

    if (!promotion) {
      throw AppError.notFound('Promotion batch not found');
    }

    if (promotion.status === 'Completed') {
      throw AppError.conflict('Promotion already completed');
    }

    // Get all students in the class
    const students = await User.find({
      role: 'Student',
      'studentProfile.class': promotion.fromClass._id,
      isActive: true,
    });

    promotion.status = 'Processing';
    await promotion.save();

    const processedStudents = [];

    // Class positions come from one read, ranked once. This used to sit inside
    // the per-student loop, so a class of 45 ran 45 identical queries.
    const allResults = await Result.find({
      class: promotion.fromClass._id,
      academicYear: promotion.academicYear,
      isPublished: true,
    }).select('student totalScore');

    const studentAverages = {};
    allResults.forEach((result) => {
      const studentId = String(result.student);
      if (!studentAverages[studentId]) {
        studentAverages[studentId] = { total: 0, count: 0 };
      }
      studentAverages[studentId].total += result.totalScore;
      studentAverages[studentId].count += 1;
    });

    const rankedStudents = Object.entries(studentAverages)
      .map(([id, data]) => ({
        studentId: id,
        average: data.total / data.count,
      }))
      .sort((a, b) => b.average - a.average);

    for (const student of students) {
      // Get student's yearly performance
      const trackers = await CATracker.find({
        student: student._id,
        academicYear: promotion.academicYear,
      }).populate('subject');

      // Calculate yearly average
      const yearlyAverages = trackers
        .map((t) => t.yearlyAverage)
        .filter((a) => a !== null && a !== undefined && a !== 0);
      const overallAverage =
        yearlyAverages.length > 0
          ? yearlyAverages.reduce((sum, val) => sum + val, 0) /
            yearlyAverages.length
          : null;

      // Find failed subjects (yearly average < 40). A tracker with no average
      // yet is "not assessed", not a fail: null < 40 is true in JavaScript.
      const failedSubjects = trackers
        .filter(
          (t) =>
            t.subject &&
            typeof t.yearlyAverage === 'number' &&
            t.yearlyAverage < 40,
        )
        .map((t) => t.subject._id);

      // Check core subjects if required
      let failedCoreSubjects = [];
      if (
        promotion.criteria.coreSubjectsMustPass &&
        promotion.criteria.coreSubjects.length > 0
      ) {
        failedCoreSubjects = failedSubjects.filter((subjectId) =>
          promotion.criteria.coreSubjects.some((core) =>
            core._id.equals(subjectId),
          ),
        );
      }

      // Determine promotion status
      let status = 'Promoted';
      let promotedTo = promotion.toClass?._id;
      let comment = 'Congratulations on your promotion!';

      // Check if student should repeat
      // Skip promotion if no tracker data exists
      if (overallAverage === null) {
        status = 'Repeated';
        promotedTo = promotion.fromClass._id;
        comment =
          'No academic records found for this academic year. Will repeat class.';
      } else if (overallAverage < promotion.criteria.minimumAverage) {
        status = 'Repeated';
        promotedTo = promotion.fromClass._id;
        comment = `Overall average (${overallAverage.toFixed(2)}%) below minimum required (${promotion.criteria.minimumAverage}%). Will repeat class.`;
      } else if (failedSubjects.length > promotion.criteria.maximumFailures) {
        status = 'Repeated';
        promotedTo = promotion.fromClass._id;
        comment = `Failed ${failedSubjects.length} subjects (maximum allowed: ${promotion.criteria.maximumFailures}). Will repeat class.`;
      } else if (failedCoreSubjects.length > 0) {
        status = 'Repeated';
        promotedTo = promotion.fromClass._id;
        comment = `Failed core subject(s). Must repeat class.`;
      }

      // Check if graduating (SS3 → null)
      if (status === 'Promoted' && !promotion.toClass) {
        status = 'Graduated';
        comment = 'Congratulations on your graduation!';
      }

      // 0 means "no published results for this student".
      const position =
        rankedStudents.findIndex((a) => a.studentId === String(student._id)) +
        1;

      processedStudents.push({
        student: student._id,
        status,
        promotedTo,
        // A student with no tracker data has no average. That is the case the
        // "no academic records" branch above handles, and calling toFixed on
        // its null crashed the whole batch.
        yearlyAverage:
          overallAverage === null ? 0 : parseFloat(overallAverage.toFixed(2)),
        yearlyPosition: position,
        totalStudents: students.length,
        failedSubjects,
        failedCount: failedSubjects.length,
        comment,
        processedBy: userId,
        processedAt: new Date(),
      });
    }

    promotion.students = processedStudents;
    promotion.status = 'Completed';
    promotion.completedAt = new Date();
    await promotion.save();

    return promotion;
  }

  // Manually override student promotion status
  async updateStudentStatus(promotionId, studentId, updates, userId) {
    const promotion = await Promotion.findById(promotionId);

    if (!promotion) {
      throw AppError.notFound('Promotion batch not found');
    }

    const studentIndex = promotion.students.findIndex(
      (s) => s.student.toString() === studentId,
    );

    if (studentIndex === -1) {
      throw AppError.notFound('Student not found in promotion batch');
    }

    // Update the student's promotion status
    Object.assign(promotion.students[studentIndex], {
      ...updates,
      processedBy: userId,
      processedAt: new Date(),
    });

    await promotion.save();

    return promotion;
  }

  // Apply promotions (update student classes)
  async applyPromotions(promotionId, userId) {
    const promotion = await Promotion.findById(promotionId)
      .populate('students.student')
      .populate('students.promotedTo');

    if (!promotion) {
      throw AppError.notFound('Promotion batch not found');
    }

    if (promotion.status !== 'Completed') {
      throw AppError.badRequest('Promotion must be completed before applying');
    }

    const updatePromises = promotion.students.map(async (entry) => {
      const student = await User.findById(entry.student._id);

      if (!student) return null;

      if (entry.status === 'Promoted' || entry.status === 'Repeated') {
        student.studentProfile.class = entry.promotedTo;
        await student.save();
      } else if (entry.status === 'Graduated') {
        // The schema field is `profileStatus`. This wrote `status`, which is
        // not in the schema, so Mongoose dropped it silently: graduates stayed
        // Active, kept being billed and kept appearing on registers.
        student.studentProfile.graduationDate = new Date();
        student.studentProfile.profileStatus = 'Graduated';
        await student.save();
      } else if (entry.status === 'Withdrawn') {
        student.isActive = false;
        student.studentProfile.profileStatus = 'Withdrawn';
        await student.save();
      }

      return student;
    });

    await Promise.all(updatePromises);

    return { message: 'Promotions applied successfully', promotion };
  }

  // Get promotion batch
  async getPromotionById(id) {
    const promotion = await Promotion.findById(id)
      .populate('fromClass', 'name level')
      .populate('toClass', 'name level')
      .populate('students.student', 'firstName lastName studentProfile')
      .populate('students.promotedTo', 'name level')
      .populate('students.failedSubjects', 'name code')
      .populate('createdBy', 'firstName lastName');

    if (!promotion) {
      throw AppError.notFound('Promotion batch not found');
    }

    return promotion;
  }

  // Get all promotions
  async getAllPromotions(filters = {}) {
    const query = {};

    if (filters.academicYear) query.academicYear = filters.academicYear;
    if (filters.fromClass) query.fromClass = filters.fromClass;
    if (filters.status) query.status = filters.status;

    const promotions = await Promotion.find(query)
      .populate('fromClass', 'name level')
      .populate('toClass', 'name level')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    return promotions;
  }

  // Delete promotion batch
  async deletePromotion(id) {
    const promotion = await Promotion.findById(id);

    if (!promotion) {
      throw AppError.notFound('Promotion batch not found');
    }

    if (promotion.status === 'Completed') {
      throw AppError.badRequest('Cannot delete completed promotion batch');
    }

    await promotion.deleteOne();
    return { message: 'Promotion batch deleted successfully' };
  }

  // Get promotion statistics
  async getPromotionStats(promotionId) {
    const promotion = await Promotion.findById(promotionId);

    if (!promotion) {
      throw AppError.notFound('Promotion batch not found');
    }

    const stats = {
      total: promotion.students.length,
      promoted: promotion.students.filter((s) => s.status === 'Promoted')
        .length,
      repeated: promotion.students.filter((s) => s.status === 'Repeated')
        .length,
      graduated: promotion.students.filter((s) => s.status === 'Graduated')
        .length,
      withdrawn: promotion.students.filter((s) => s.status === 'Withdrawn')
        .length,
      averageScore: 0,
      passRate: 0,
    };

    if (stats.total > 0) {
      const totalAverage = promotion.students.reduce(
        (sum, s) => sum + (s.yearlyAverage || 0),
        0,
      );
      stats.averageScore = parseFloat((totalAverage / stats.total).toFixed(2));
      stats.passRate = parseFloat(
        (((stats.promoted + stats.graduated) / stats.total) * 100).toFixed(2),
      );
    }

    return stats;
  }
}

module.exports = new PromotionService();
