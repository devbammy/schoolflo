/**
 * Filtering the student list by section (arm) within a class: the Students
 * page's Section filter, and the counts above the table.
 */

const request = require('supertest');
const express = require('express');
require('express-async-errors');
const db = require('../setup/db');

const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const errorHandler = require('../../src/middleware/errorHandler');
const { getUsers } = require('../../src/controllers/userController');

let actingUser;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.get('/users', getUsers);
app.use(errorHandler);

let n = 0;
const student = (firstName, classDoc, section) => {
  n += 1;
  return User.create({
    firstName,
    lastName: `S${n}`,
    password: 'password123',
    role: 'Student',
    studentProfile: { class: classDoc._id, section },
  });
};

let ss2;
let jss3;

beforeAll(db.connect);
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  actingUser = await User.create({
    firstName: 'Head',
    lastName: 'Admin',
    email: 'admin@school.ng',
    password: 'password123',
    role: 'Admin',
  });
  ss2 = await Class.create({
    name: 'SS 2 Humanities & Business',
    level: 'SS',
    sections: [{ name: 'A' }, { name: 'C' }],
  });
  jss3 = await Class.create({
    name: 'JSS 3',
    level: 'JSS',
    sections: [{ name: 'A' }, { name: 'B' }],
  });
  await student('Ada', ss2, 'A');
  await student('Bola', ss2, 'C');
  await student('Chidi', ss2, 'C');
  await student('Dayo', jss3, 'A');
  await student('Efe', jss3, 'B');
});

const names = (res) => res.body.data.map((u) => u.firstName).sort();

const list = (query) =>
  request(app)
    .get('/users')
    .query({ role: 'Student', ...query });

describe('the section filter', () => {
  it('shows only that section of the chosen class', async () => {
    const res = await list({ class: String(ss2._id), section: 'C' });

    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Bola', 'Chidi']);
    expect(res.body.meta.total).toBe(2);
  });

  it('never mixes in the same section letter from another class', async () => {
    const res = await list({ class: String(jss3._id), section: 'A' });

    expect(names(res)).toEqual(['Dayo']);
  });

  it('matches a section saved in lower case by the import', async () => {
    await User.updateOne(
      { firstName: 'Efe' },
      { 'studentProfile.section': 'b' },
    );

    const res = await list({ class: String(jss3._id), section: 'B' });

    expect(names(res)).toEqual(['Efe']);
  });

  it('is ignored without a class, rather than mixing every class', async () => {
    const res = await list({ section: 'A' });

    expect(res.body.meta.total).toBe(5);
  });

  it('treats the section as text, not a pattern', async () => {
    const res = await list({ class: String(ss2._id), section: '.*' });

    expect(res.body.meta.total).toBe(0);
  });
});
