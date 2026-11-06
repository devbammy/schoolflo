const request = require('supertest');
const express = require('express');
require('express-async-errors');
const db = require('../setup/db');

const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const errorHandler = require('../../src/middleware/errorHandler');
const {
  createClass,
  updateClass,
  deactivateClass,
} = require('../../src/controllers/classController');

const app = express();
app.use(express.json());
app.post('/classes', createClass);
app.put('/classes/:id', updateClass);
app.delete('/classes/:id', deactivateClass);
app.use(errorHandler);

const jss1 = (extra = {}) => ({
  name: 'JSS 1',
  level: 'JSS',
  sections: [{ name: 'A', capacity: 40, classTeacher: '' }],
  ...extra,
});

beforeAll(db.connect);
afterAll(db.close);
beforeEach(db.clear);

describe('creating a class that was deleted', () => {
  it('restores the deactivated class instead of refusing the name', async () => {
    const first = await request(app).post('/classes').send(jss1());
    await request(app).delete(`/classes/${first.body.data.class._id}`);

    const again = await request(app)
      .post('/classes')
      .send(jss1({ sections: [{ name: 'Gold', capacity: 30 }] }));

    expect(again.status).toBe(200);
    expect(again.body.data.restored).toBe(true);
    expect(again.body.data.class._id).toBe(first.body.data.class._id);
    expect(await Class.countDocuments()).toBe(1);

    const stored = await Class.findById(first.body.data.class._id);
    expect(stored.isActive).toBe(true);
    expect(stored.sections.map((s) => s.name)).toEqual(['Gold']);
  });

  it('keeps students attached to the restored class', async () => {
    const first = await request(app).post('/classes').send(jss1());
    const classId = first.body.data.class._id;
    await User.create({
      firstName: 'Ada',
      lastName: 'Obi',
      email: 'ada@school.ng',
      password: 'password123',
      role: 'Student',
      studentProfile: { class: classId },
    });
    await request(app).delete(`/classes/${classId}`);

    await request(app).post('/classes').send(jss1());

    expect(await User.countDocuments({ 'studentProfile.class': classId })).toBe(
      1,
    );
  });

  it('still refuses a name an active class has', async () => {
    await request(app).post('/classes').send(jss1());

    const again = await request(app).post('/classes').send(jss1());

    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already exists/);
  });
});

describe('editing a class', () => {
  it('saves a section with no class teacher', async () => {
    const created = await request(app).post('/classes').send(jss1());

    const res = await request(app)
      .put(`/classes/${created.body.data.class._id}`)
      .send(
        jss1({
          sections: [
            { name: 'A', capacity: 40, classTeacher: '' },
            { name: 'B', capacity: 35, classTeacher: '' },
          ],
        }),
      );

    expect(res.status).toBe(200);
    expect(res.body.data.class.sections).toHaveLength(2);
  });

  it('explains a rename onto a deactivated class', async () => {
    const old = await request(app).post('/classes').send(jss1());
    await request(app).delete(`/classes/${old.body.data.class._id}`);
    const other = await request(app)
      .post('/classes')
      .send(jss1({ name: 'JSS 2' }));

    const res = await request(app)
      .put(`/classes/${other.body.data.class._id}`)
      .send({ name: 'JSS 1' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/deactivated/);
  });

  it('ignores fields the form does not own', async () => {
    const created = await request(app).post('/classes').send(jss1());
    const id = created.body.data.class._id;
    await request(app).delete(`/classes/${id}`);

    await request(app).put(`/classes/${id}`).send({ isActive: true });

    expect((await Class.findById(id)).isActive).toBe(false);
  });
});

describe('cast errors', () => {
  it('never shows [object Object]', async () => {
    const created = await request(app).post('/classes').send(jss1());

    const res = await request(app)
      .put(`/classes/${created.body.data.class._id}`)
      .send({ sections: [{ name: 'A', classTeacher: { bad: true } }] });

    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/object Object/);
  });
});
