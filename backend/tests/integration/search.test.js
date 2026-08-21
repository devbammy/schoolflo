const db = require('../setup/db');

const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const { Assignment } = require('../../src/models/Assignment');
const Subject = require('../../src/models/Subject');
const Announcement = require('../../src/models/Announcement');
const { search, groupsForRole } = require('../../src/services/searchService');

/**
 * The search box is a permission boundary as much as a convenience: it reaches
 * across every collection at once, so anything it over-returns leaks quietly.
 * These tests exist to pin down what each role may find.
 */

let admin;
let teacher;
let strangerTeacher;
let student;
let parent;
let ownClass;
let otherClass;

const makeUser = (role, firstName, extra = {}) =>
  User.create({
    firstName,
    lastName: 'Adeyemi',
    email: `${firstName.toLowerCase()}@school.com`,
    password: 'password123',
    role,
    ...extra,
  });

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();

  admin = await makeUser('Admin', 'Ada');

  ownClass = await Class.create({
    name: 'JSS1',
    level: 'JSS',
    academicYear: '2025/2026',
  });
  otherClass = await Class.create({
    name: 'SS3',
    level: 'SS',
    academicYear: '2025/2026',
  });

  teacher = await makeUser('Teacher', 'Bola', {
    teacherProfile: { classTeacherOf: ownClass._id },
  });
  strangerTeacher = await makeUser('Teacher', 'Chidi');

  student = await makeUser('Student', 'Dami', {
    studentProfile: { class: ownClass._id },
  });

  await makeUser('Student', 'Damilola', {
    studentProfile: { class: otherClass._id },
  });

  parent = await makeUser('Parent', 'Emeka', {
    parentProfile: { children: [student._id] },
  });
});

describe('scopes', () => {
  it('never offers staff records to a parent or a student', () => {
    expect(groupsForRole('Parent')).not.toContain('teachers');
    expect(groupsForRole('Parent')).not.toContain('students');
    expect(groupsForRole('Student')).not.toContain('parents');
    expect(groupsForRole('Student')).not.toContain('tasks');
  });
});

describe('query handling', () => {
  it('returns nothing for a query below the minimum length', async () => {
    const result = await search({ user: admin, query: 'a' });

    expect(result.total).toBe(0);
    expect(result.groups).toEqual({});
  });

  it('treats regex metacharacters as text, not syntax', async () => {
    const result = await search({ user: admin, query: '.*' });

    // A live pattern would have matched every student in the school.
    expect(result.groups.students).toBeUndefined();
  });
});

describe('students', () => {
  it('lets an admin find any student', async () => {
    const result = await search({ user: admin, query: 'Dami' });

    expect(result.groups.students).toHaveLength(2);
  });

  it('limits a teacher to students in their own class', async () => {
    const result = await search({ user: teacher, query: 'Dami' });

    expect(result.groups.students).toHaveLength(1);
    expect(result.groups.students[0].title).toBe('Dami Adeyemi');
  });

  it('gives a teacher with no class nothing', async () => {
    const result = await search({ user: strangerTeacher, query: 'Dami' });

    expect(result.groups.students).toBeUndefined();
  });

  it('shows a parent only their own child', async () => {
    const result = await search({ user: parent, query: 'Dami' });

    expect(result.groups.students).toBeUndefined();
    expect(result.groups.children).toHaveLength(1);
    expect(result.groups.children[0].id).toBe(String(student._id));
  });
});

describe('assignments', () => {
  beforeEach(async () => {
    const subject = await Subject.create({
      name: 'Mathematics',
      code: 'MTH',
    });

    await Assignment.create({
      title: 'Algebra worksheet',
      description: 'Questions 1 to 20 from chapter four.',
      class: ownClass._id,
      subject: subject._id,
      teacher: teacher._id,
      term: 'First Term',
      academicYear: '2025/2026',
      dueDate: new Date(),
      totalMarks: 20,
      isPublished: false,
    });
  });

  it('hides an unpublished assignment from the student it is meant for', async () => {
    const result = await search({ user: student, query: 'Algebra' });

    expect(result.groups.assignments).toBeUndefined();
  });

  it('shows the teacher their own draft', async () => {
    const result = await search({ user: teacher, query: 'Algebra' });

    expect(result.groups.assignments).toHaveLength(1);
  });

  it('shows a published assignment to the student', async () => {
    await Assignment.updateOne({}, { isPublished: true });

    const result = await search({ user: student, query: 'Algebra' });

    expect(result.groups.assignments).toHaveLength(1);
  });
});

describe('announcements', () => {
  beforeEach(async () => {
    await Announcement.create({
      title: 'Staff briefing',
      body: 'All teachers to report at 7am.',
      author: admin._id,
      targetAudience: ['Teacher'],
      isPublished: true,
    });
  });

  it('keeps a staff-only notice away from a parent', async () => {
    const result = await search({ user: parent, query: 'briefing' });

    expect(result.groups.announcements).toBeUndefined();
  });

  it('surfaces it to the audience it was addressed to', async () => {
    const result = await search({ user: teacher, query: 'briefing' });

    expect(result.groups.announcements).toHaveLength(1);
  });
});

describe('result shape', () => {
  it('carries a role-appropriate link on every hit', async () => {
    const asAdmin = await search({ user: admin, query: 'JSS1' });
    expect(asAdmin.groups.classes[0].url).toContain('/admin/classes');

    const asTeacher = await search({ user: teacher, query: 'JSS1' });
    expect(asTeacher.groups.classes[0].url).toContain('/teacher/attendance');
  });
});
