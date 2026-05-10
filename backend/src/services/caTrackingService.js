const CATracker = require('../models/CATracker');
const { Result } = require('../models/Exam'); // Using existing Result model
const User = require('../models/User');
const Subject = require('../models/Subject');

class CATrackingService {
  // Sync CA tracker with results (run after results are published)
  async syncFromResults(studentId, academicYear) {
    // Get all results for student in this academic year
    const results = await Result.find({
      student: studentId,
      academicYear,
      isPublished: true,
    }).populate('subject');

    // Group by subject
    const subjectGroups = {};
    results.forEach((result) => {
      const subjectId = result.subject._id.toString();
      if (!subjectGroups[subjectId]) {
        subjectGroups[subjectId] = {
          subject: result.subject,
          terms: [],
        };
      }
      subjectGroups[subjectId].terms.push({
        term: result.term,
        ca1: result.scores.ca1,
        ca2: result.scores.ca2,
        midTerm: result.scores.midTerm,
        exam: result.scores.exam,
        total: result.totalScore,
        grade: result.grade,
        position: result.position,
        classAverage: result.classAverage,
      });
    });

    // Create or update trackers
    const trackers = [];
    for (const [subjectId, data] of Object.entries(subjectGroups)) {
      // Calculate improvement for each term
      const sortedTerms = data.terms.sort((a, b) => {
        const termOrder = {
          'First Term': 1,
          'Second Term': 2,
          'Third Term': 3,
        };
        return termOrder[a.term] - termOrder[b.term];
      });

      sortedTerms.forEach((termData, index) => {
        if (index > 0) {
          termData.improvement = termData.total - sortedTerms[index - 1].total;
        } else {
          termData.improvement = 0;
        }
      });

      let tracker = await CATracker.findOne({
        student: studentId,
        subject: subjectId,
        academicYear,
      });

      if (!tracker) {
        tracker = new CATracker({
          student: studentId,
          subject: subjectId,
          academicYear,
          termRecords: sortedTerms,
        });
      } else {
        tracker.termRecords = sortedTerms;
      }

      tracker.calculateYearlyAverage();
      tracker.calculateTrend();
      await tracker.save();
      trackers.push(tracker);
    }

    return trackers;
  }

  // Get student's CA tracking for all subjects
  async getStudentTracking(studentId, academicYear) {
    const trackers = await CATracker.find({
      student: studentId,
      academicYear,
    }).populate('subject', 'name code');

    return trackers;
  }

  // Get class-wide CA tracking for a subject
  async getClassTracking(classId, subjectId, academicYear) {
    // Get all students in the class
    const students = await User.find({
      role: 'Student',
      'studentProfile.class': classId,
      isActive: true,
    }).select('firstName lastName studentProfile.admissionNumber');

    // Get tracking data for all students
    const trackingPromises = students.map(async (student) => {
      const tracker = await CATracker.findOne({
        student: student._id,
        subject: subjectId,
        academicYear,
      }).populate('subject', 'name code');

      return {
        student: {
          _id: student._id,
          name: `${student.firstName} ${student.lastName}`,
          admissionNumber: student.studentProfile.admissionNumber,
        },
        tracker: tracker || null,
      };
    });

    const trackingData = await Promise.all(trackingPromises);

    return trackingData;
  }

  // Get performance analytics for a student
  async getStudentAnalytics(studentId, academicYear) {
    const trackers = await CATracker.find({
      student: studentId,
      academicYear,
    }).populate('subject', 'name code');

    // Calculate overall statistics
    const totalSubjects = trackers.length;
    const improvingCount = trackers.filter(
      (t) => t.trend === 'Improving',
    ).length;
    const decliningCount = trackers.filter(
      (t) => t.trend === 'Declining',
    ).length;
    const stableCount = trackers.filter((t) => t.trend === 'Stable').length;

    const yearlyAverages = trackers
      .map((t) => t.yearlyAverage)
      .filter((a) => a);
    const overallAverage =
      yearlyAverages.length > 0
        ? yearlyAverages.reduce((sum, val) => sum + val, 0) /
          yearlyAverages.length
        : 0;

    // Best and worst performing subjects
    const sortedByAverage = [...trackers].sort(
      (a, b) => (b.yearlyAverage || 0) - (a.yearlyAverage || 0),
    );

    return {
      totalSubjects,
      overallAverage: parseFloat(overallAverage.toFixed(2)),
      trends: {
        improving: improvingCount,
        declining: decliningCount,
        stable: stableCount,
        inconsistent:
          totalSubjects - improvingCount - decliningCount - stableCount,
      },
      bestPerformance: sortedByAverage.slice(0, 3).map((t) => ({
        subject: t.subject.name,
        average: t.yearlyAverage,
        trend: t.trend,
      })),
      needsAttention: sortedByAverage
        .slice(-3)
        .reverse()
        .map((t) => ({
          subject: t.subject.name,
          average: t.yearlyAverage,
          trend: t.trend,
        })),
      subjectDetails: trackers,
    };
  }

  // Generate comparison chart data
  async generateChartData(studentId, subjectId, academicYear) {
    const tracker = await CATracker.findOne({
      student: studentId,
      subject: subjectId,
      academicYear,
    }).populate('subject', 'name');

    if (!tracker) {
      return null;
    }

    const chartData = {
      labels: tracker.termRecords.map((r) => r.term),
      datasets: [
        {
          label: 'Total Score',
          data: tracker.termRecords.map((r) => r.total || 0),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
        },
        {
          label: 'Class Average',
          data: tracker.termRecords.map((r) => r.classAverage || 0),
          borderColor: 'rgb(255, 159, 64)',
          backgroundColor: 'rgba(255, 159, 64, 0.2)',
        },
      ],
      subject: tracker.subject.name,
      trend: tracker.trend,
    };

    return chartData;
  }
}

module.exports = new CATrackingService();
