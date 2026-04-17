const { Result, Exam, calculateGrade } = require('../models/Exam');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const {
  computeClassStatistics,
  generateReportCard,
} = require('../services/gradingService');

// ✅ Helper (centralized calculation)
const computeResultFields = (scores = {}) => {
  const { ca1 = 0, ca2 = 0, midTerm = 0, exam = 0 } = scores;

  const totalScore = ca1 + ca2 + midTerm + exam;
  const grading = calculateGrade(totalScore);

  return {
    scores: { ca1, ca2, midTerm, exam },
    totalScore,
    grade: grading.grade,
    remark: grading.remark,
    gradePoint: grading.gradePoint,
  };
};

// @desc    Enter/update scores for a student subject
const upsertResult = async (req, res) => {
  try {
    const {
      student,
      class: classId,
      subject,
      exam,
      term,
      academicYear,
      scores,
      teacherComment,
    } = req.body;

    const studentUser = await User.findById(student);
    if (!studentUser || studentUser.role !== 'Student') {
      return sendError(res, 404, 'Student not found');
    }

    // ✅ Validate score caps
    const { ca1 = 0, ca2 = 0, midTerm = 0, exam: examScore = 0 } = scores || {};
    if (ca1 > 10 || ca2 > 10 || midTerm > 10 || examScore > 70) {
      return sendError(res, 400, 'Score exceeds maximum');
    }

    // ✅ COMPUTE HERE (critical fix)
    const computed = computeResultFields({
      ca1,
      ca2,
      midTerm,
      exam: examScore,
    });

    const result = await Result.findOneAndUpdate(
      { student, subject, term, academicYear },
      {
        student,
        class: classId,
        subject,
        exam,
        term,
        academicYear,
        ...computed, // ✅ inject calculated fields
        teacherComment,
        gradedBy: req.user._id,
      },
      { new: true, upsert: true, runValidators: true },
    )
      .populate('subject', 'name code')
      .populate('student', 'firstName lastName');

    return sendSuccess(res, 200, 'Result saved successfully', { result });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Bulk upload results
const bulkUpsertResults = async (req, res) => {
  try {
    const { class: classId, subject, term, academicYear, results } = req.body;

    if (!Array.isArray(results) || !results.length) {
      return sendError(res, 400, 'Results array is required');
    }

    const operations = results.map(
      ({ student, scores = {}, teacherComment }) => {
        const { ca1 = 0, ca2 = 0, midTerm = 0, exam = 0 } = scores;

        // ✅ COMPUTE HERE (critical fix)
        const computed = computeResultFields({ ca1, ca2, midTerm, exam });

        return {
          updateOne: {
            filter: { student, subject, term, academicYear },
            update: {
              $set: {
                student,
                class: classId,
                subject,
                term,
                academicYear,
                ...computed, // ✅ inject calculated fields
                teacherComment,
                gradedBy: req.user._id,
              },
            },
            upsert: true,
          },
        };
      },
    );

    const bulkResult = await Result.bulkWrite(operations);

    return sendSuccess(
      res,
      200,
      `${bulkResult.upsertedCount + bulkResult.modifiedCount} results saved`,
      {
        inserted: bulkResult.upsertedCount,
        updated: bulkResult.modifiedCount,
      },
    );
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

module.exports = {
  upsertResult,
  bulkUpsertResults,
};
