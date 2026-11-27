/**
 * The report card on the school's own design (its first-, second- and
 * third-term sheets): header figures, positions and averages within the arm,
 * attendance from the register, behaviour and the teacher's comment, the
 * head's comment by grade, next term's date, the promotion stamp, and the
 * cumulative columns.
 */

const db = require('../setup/db');

const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const Subject = require('../../src/models/Subject');
const Attendance = require('../../src/models/Attendance');
const AcademicCalendar = require('../../src/models/AcademicCalendar');
const Promotion = require('../../src/models/Promotion');
const { ReportRemark } = require('../../src/models/ReportRemark');
const { Result } = require('../../src/models/Exam');
const { generateReportCard } = require('../../src/services/gradingService');
const { regradeOf } = require('../../src/utils/regradeResults');

const YEAR = '2024/2025';
const FIRST = 'First Term';
const SECOND = 'Second Term';
const THIRD = 'Third Term';

let n = 0;
const makeStudent = (classDoc, section) => {
  n += 1;
  return User.create({
    firstName: 'Pupil',
    lastName: `P${n}`,
    password: 'password123',
    role: 'Student',
    studentProfile: { class: classDoc._id, section },
  });
};

const score = (student, classDoc, subject, term, totalScore) =>
  Result.create({
    student: student._id,
    class: classDoc._id,
    subject: subject._id,
    term,
    academicYear: YEAR,
    isPublished: true,
    // Exam alone carries the total, so the save hook grades it.
    scores: {
      exam: Math.min(totalScore, 60),
      ca1: Math.max(0, Math.min(totalScore - 60, 10)),
      ca2: Math.max(0, Math.min(totalScore - 70, 10)),
      classWork: Math.max(0, Math.min(totalScore - 80, 10)),
      project: Math.max(0, Math.min(totalScore - 90, 10)),
    },
  });

let staff;
let basic1;
let jss1;
let maths;
let english;

beforeAll(db.connect);
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  staff = await User.create({
    firstName: 'Head',
    lastName: 'Admin',
    email: 'admin@school.ng',
    password: 'password123',
    role: 'Admin',
  });
  basic1 = await Class.create({
    name: 'Basic 1',
    level: 'Primary',
    sections: [{ name: 'A' }, { name: 'B' }],
  });
  jss1 = await Class.create({
    name: 'JSS 1',
    level: 'JSS',
    sections: [{ name: 'A' }],
  });
  maths = await Subject.create({ name: 'Mathematics', code: 'MTH' });
  english = await Subject.create({ name: 'English', code: 'ENG' });
});

describe("grading on the class's own scale", () => {
  it('grades a primary result on the primary key and a college one on the college key', async () => {
    const a = await makeStudent(basic1, 'A');
    const b = await makeStudent(jss1, 'A');
    const primary = await score(a, basic1, maths, FIRST, 72);
    const college = await score(b, jss1, maths, FIRST, 72);

    expect(primary.grade).toBe('B2');
    expect(primary.remark).toBe('Very Good');
    expect(college.grade).toBe('C4');
    expect(college.remark).toBe('Credit');
  });
});

describe('the header figures, within the arm', () => {
  let top;
  let mid;
  let otherArm;

  beforeEach(async () => {
    top = await makeStudent(basic1, 'A');
    mid = await makeStudent(basic1, 'A');
    otherArm = await makeStudent(basic1, 'B');
    for (const [s, m, e] of [
      [top, 90, 80],
      [mid, 70, 60],
      [otherArm, 100, 100],
    ]) {
      await score(s, basic1, maths, FIRST, m);
      await score(s, basic1, english, FIRST, e);
    }
  });

  it("adds up like the school's card", async () => {
    const card = await generateReportCard(mid._id, FIRST, YEAR);

    expect(card.summary).toMatchObject({
      obtainableScore: 200,
      obtainedScore: 130,
      average: 65,
      grade: 'B3',
      gradeLabel: 'B3 (Good)',
      scope: 'arm',
      section: 'A',
    });
    expect(card.scaleKey).toBe('primary');
    expect(card.gradeScale[0]).toMatchObject({ grade: 'A1', min: 80 });
  });

  it('compares a student with their arm only', async () => {
    const card = await generateReportCard(mid._id, FIRST, YEAR);

    // Arm A: averages 85 and 65. Arm B's 100 is left out.
    expect(card.summary).toMatchObject({
      totalStudentsInClass: 2,
      highestAverage: 85,
      lowestAverage: 65,
      classAverage: 75,
      overallPosition: 2,
    });
  });

  it('compares the whole class when staff ask for it', async () => {
    const card = await generateReportCard(mid._id, FIRST, YEAR, {
      scope: 'class',
    });

    expect(card.summary).toMatchObject({
      scope: 'class',
      totalStudentsInClass: 3,
      highestAverage: 100,
      overallPosition: 3,
    });
  });

  it('ranks each subject within the arm', async () => {
    const card = await generateReportCard(mid._id, FIRST, YEAR);
    const mathsRow = card.results.find(
      (r) => String(r.subject._id) === String(maths._id),
    );

    expect(mathsRow.position).toBe(2);
  });

  it("gives the head's comment for the grade, with the primary label", async () => {
    const card = await generateReportCard(top._id, FIRST, YEAR);

    expect(card.summary.grade).toBe('A1');
    expect(card.summary.principalComment).toBe(
      'AN EXCELLENT RESULT, KEEP IT UP',
    );
    expect(card.summary.headCommentLabel).toMatch(/HEAD TEACHER/);
  });
});

describe('the college card', () => {
  it("uses the college key and the head of school's label", async () => {
    const s = await makeStudent(jss1, 'A');
    await score(s, jss1, maths, FIRST, 69.81);

    const card = await generateReportCard(s._id, FIRST, YEAR);

    expect(card.scaleKey).toBe('college');
    expect(card.summary.grade).toBe('C5');
    expect(card.summary.principalComment).toBe(
      'GOOD RESULT, THERE IS ROOM FOR IMPROVEMENT',
    );
    expect(card.summary.headCommentLabel).toMatch(/HEAD OF SCHOOL/);
  });
});

describe('attendance, behaviour and comments', () => {
  it('counts Present and Late as present, Absent and Excused as absent', async () => {
    const s = await makeStudent(basic1, 'A');
    await score(s, basic1, maths, FIRST, 70);
    const day = (d) => new Date(Date.UTC(2024, 9, d));
    for (const [d, status] of [
      [1, 'Present'],
      [2, 'Present'],
      [3, 'Late'],
      [4, 'Absent'],
      [7, 'Excused'],
    ]) {
      await Attendance.create({
        student: s._id,
        class: basic1._id,
        date: day(d),
        status,
        term: FIRST,
        academicYear: YEAR,
        markedBy: staff._id,
      });
    }

    const card = await generateReportCard(s._id, FIRST, YEAR);

    expect(card.attendance).toEqual({ daysPresent: 3, daysAbsent: 2 });
  });

  it('leaves attendance blank when no register was kept', async () => {
    const s = await makeStudent(basic1, 'A');
    await score(s, basic1, maths, FIRST, 70);

    const card = await generateReportCard(s._id, FIRST, YEAR);

    expect(card.attendance).toBeNull();
  });

  it("carries the form teacher's behaviour ratings and comment", async () => {
    const s = await makeStudent(basic1, 'A');
    await score(s, basic1, maths, FIRST, 70);
    await ReportRemark.create({
      student: s._id,
      class: basic1._id,
      term: FIRST,
      academicYear: YEAR,
      behaviour: { punctuality: 'Very Good', neatness: 'Excellent' },
      teacherComment: 'Well behaved. Keep it up',
    });

    const card = await generateReportCard(s._id, FIRST, YEAR);

    expect(card.behaviour).toMatchObject({
      punctuality: 'Very Good',
      neatness: 'Excellent',
    });
    expect(card.teacherComment).toBe('Well behaved. Keep it up');
  });
});

describe('next term and promotion', () => {
  it("names next term's start date from the calendar", async () => {
    const s = await makeStudent(basic1, 'A');
    await score(s, basic1, maths, FIRST, 70);
    await AcademicCalendar.create({
      academicYear: YEAR,
      sessionStartDate: new Date('2024-09-09'),
      sessionEndDate: new Date('2025-07-25'),
      createdBy: staff._id,
      terms: [
        {
          name: FIRST,
          startDate: new Date('2024-09-09'),
          endDate: new Date('2024-12-13'),
        },
        {
          name: SECOND,
          startDate: new Date('2025-01-06'),
          endDate: new Date('2025-04-11'),
        },
      ],
    });

    const card = await generateReportCard(s._id, FIRST, YEAR);

    expect(card.nextTerm).toMatchObject({
      term: SECOND,
      academicYear: YEAR,
    });
    expect(new Date(card.nextTerm.startDate).toISOString()).toMatch(
      /^2025-01-06/,
    );
  });

  it('after Third Term, points at First Term of the next session', async () => {
    const s = await makeStudent(jss1, 'A');
    await score(s, jss1, maths, THIRD, 70);

    const card = await generateReportCard(s._id, THIRD, YEAR);

    expect(card.nextTerm).toMatchObject({
      term: FIRST,
      academicYear: '2025/2026',
      startDate: null,
    });
  });

  it('stamps the promotion outcome on Third Term once the batch is applied', async () => {
    const s = await makeStudent(jss1, 'A');
    await score(s, jss1, maths, THIRD, 70);
    const batch = await Promotion.create({
      academicYear: YEAR,
      fromClass: jss1._id,
      students: [{ student: s._id, status: 'Promoted' }],
      createdBy: staff._id,
    });

    expect((await generateReportCard(s._id, THIRD, YEAR)).promotion).toBeNull();

    await Promotion.updateOne({ _id: batch._id }, { appliedAt: new Date() });
    expect((await generateReportCard(s._id, THIRD, YEAR)).promotion).toBe(
      'Promoted',
    );
  });
});

describe('the cumulative columns', () => {
  it("reproduces the school's Second Term figures", async () => {
    const s = await makeStudent(basic1, 'A');
    await score(s, basic1, maths, FIRST, 86);
    await score(s, basic1, maths, SECOND, 79);

    const card = await generateReportCard(s._id, SECOND, YEAR);
    const [subject] = card.cumulative.subjects;

    expect(subject).toMatchObject({
      obtainableScore: 200,
      obtainedScore: 165,
      cumulativeScore: 82.5,
      grade: 'A1',
    });
  });

  it('divides by the terms a subject was actually taken', async () => {
    const s = await makeStudent(jss1, 'A');
    await score(s, jss1, maths, FIRST, 60);
    await score(s, jss1, maths, SECOND, 70);
    await score(s, jss1, maths, THIRD, 80);
    await score(s, jss1, english, THIRD, 66);

    const card = await generateReportCard(s._id, THIRD, YEAR);
    const bySubject = Object.fromEntries(
      card.cumulative.subjects.map((c) => [c.subject.name, c]),
    );

    expect(bySubject.Mathematics).toMatchObject({
      obtainableScore: 300,
      obtainedScore: 210,
      cumulativeScore: 70,
    });
    expect(bySubject.English).toMatchObject({
      termsCounted: 1,
      obtainableScore: 100,
      obtainedScore: 66,
      cumulativeScore: 66,
    });
  });
});

describe('re-grading results saved on the old scale', () => {
  it("maps an old letter to the grade its class's scale gives", () => {
    expect(
      regradeOf(
        { totalScore: 72, grade: 'A', remark: 'Distinction', gradePoint: 5 },
        'Primary',
      ),
    ).toEqual({ grade: 'B2', remark: 'Very Good', gradePoint: 4 });
    expect(
      regradeOf(
        { totalScore: 72, grade: 'A', remark: 'Distinction', gradePoint: 5 },
        'JSS',
      ),
    ).toEqual({ grade: 'C4', remark: 'Credit', gradePoint: 3 });
  });

  it('leaves an already correct result alone', () => {
    expect(
      regradeOf(
        { totalScore: 72, grade: 'B2', remark: 'Very Good', gradePoint: 4 },
        'Primary',
      ),
    ).toBeNull();
  });
});
