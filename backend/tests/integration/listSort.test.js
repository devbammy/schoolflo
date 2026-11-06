const request = require('supertest');
const express = require('express');
require('express-async-errors');
const db = require('../setup/db');

const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const Subject = require('../../src/models/Subject');
const { Book } = require('../../src/models/Library');
const errorHandler = require('../../src/middleware/errorHandler');
const validate = require('../../src/middleware/validate');
const { paginationQuery, sortQuery } = require('../../src/validators/common');
const { getClasses } = require('../../src/controllers/classController');
const { getSubjects } = require('../../src/controllers/subjectController');
const { getUsers } = require('../../src/controllers/userController');
const { getBooks } = require('../../src/controllers/libraryController');

let actingUser;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.get('/classes', validate(sortQuery()), getClasses);
app.get('/subjects', validate(sortQuery()), getSubjects);
app.get('/users', validate([...paginationQuery(), ...sortQuery()]), getUsers);
app.get('/books', validate([...paginationQuery(), ...sortQuery()]), getBooks);
app.use(errorHandler);

const names = (res, key) => res.body.data[key].map((item) => item.name);

beforeAll(async () => {
  await db.connect();
  // getBooks searches with $text, which needs the text index to exist.
  await Book.init();
});
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  actingUser = await User.create({
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@school.ng',
    password: 'password123',
    role: 'Admin',
  });
});

describe('classes', () => {
  beforeEach(async () => {
    // Created out of order, mixed case, with a two-digit number.
    for (const [name, level] of [
      ['SS 1', 'SS'],
      ['Basic 10', 'Primary'],
      ['jss 1', 'JSS'],
      ['Basic 2', 'Primary'],
      ['KG', 'Primary'],
    ]) {
      await Class.create({ name, level });
    }
  });

  it('come back A to Z by default, numbers in number order', async () => {
    const res = await request(app).get('/classes');

    expect(names(res, 'classes')).toEqual([
      'Basic 2',
      'Basic 10',
      'jss 1',
      'KG',
      'SS 1',
    ]);
  });

  it('reverse on za', async () => {
    const res = await request(app).get('/classes').query({ sort: 'za' });

    expect(names(res, 'classes')).toEqual([
      'SS 1',
      'KG',
      'jss 1',
      'Basic 10',
      'Basic 2',
    ]);
  });

  it('follow creation on newest and oldest', async () => {
    const newest = await request(app).get('/classes').query({ sort: 'newest' });
    const oldest = await request(app).get('/classes').query({ sort: 'oldest' });

    expect(names(newest, 'classes')[0]).toBe('KG');
    expect(names(oldest, 'classes')[0]).toBe('SS 1');
  });

  it('refuse a sort that is not on the list', async () => {
    const res = await request(app).get('/classes').query({ sort: 'name' });

    expect(res.status).toBe(400);
  });
});

describe('subjects', () => {
  it('come back A to Z by default', async () => {
    for (const [name, code] of [
      ['Physics', 'PHY'],
      ['agricultural Science', 'AGR'],
      ['Mathematics', 'MTH'],
    ]) {
      await Subject.create({ name, code });
    }

    const res = await request(app).get('/subjects');

    expect(names(res, 'subjects')).toEqual([
      'agricultural Science',
      'Mathematics',
      'Physics',
    ]);
  });
});

describe('people', () => {
  const makeStudent = (firstName, lastName) =>
    User.create({
      firstName,
      lastName,
      email: `${firstName}.${lastName}@school.ng`.toLowerCase(),
      password: 'password123',
      role: 'Student',
    });

  const shown = (res) =>
    res.body.data.map((u) => `${u.firstName} ${u.lastName}`);

  beforeEach(async () => {
    await makeStudent('Zainab', 'Musa');
    await makeStudent('ada', 'Obi');
    await makeStudent('Ada', 'Bello');
    await makeStudent('Chidi', 'Okafor');
  });

  it('sort by the name as it is shown, first name then surname', async () => {
    const res = await request(app).get('/users').query({ role: 'Student' });

    expect(shown(res)).toEqual([
      'Ada Bello',
      'ada Obi',
      'Chidi Okafor',
      'Zainab Musa',
    ]);
  });

  it('keep one order across pages', async () => {
    const page = (n) =>
      request(app).get('/users').query({ role: 'Student', limit: 2, page: n });

    const [first, second] = [await page(1), await page(2)];

    expect([...shown(first), ...shown(second)]).toEqual([
      'Ada Bello',
      'ada Obi',
      'Chidi Okafor',
      'Zainab Musa',
    ]);
  });

  it('put the newest first on request', async () => {
    const res = await request(app)
      .get('/users')
      .query({ role: 'Student', sort: 'newest' });

    expect(shown(res)[0]).toBe('Chidi Okafor');
  });
});

describe('books', () => {
  beforeEach(async () => {
    for (const title of [
      'Things Fall Apart',
      'arrow of God',
      'Purple Hibiscus',
    ]) {
      await Book.create({
        title,
        author: 'Author',
        category: 'Fiction',
        totalCopies: 1,
      });
    }
  });

  it('come back by title', async () => {
    const res = await request(app).get('/books').query({ sort: 'za' });

    expect(res.body.data.map((b) => b.title)).toEqual([
      'Things Fall Apart',
      'Purple Hibiscus',
      'arrow of God',
    ]);
  });

  it('still work with a text search, which cannot take a collation', async () => {
    const res = await request(app).get('/books').query({ search: 'Purple' });

    expect(res.status).toBe(200);
    expect(res.body.data.map((b) => b.title)).toEqual(['Purple Hibiscus']);
  });
});
