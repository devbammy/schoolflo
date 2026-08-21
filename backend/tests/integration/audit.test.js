const mongoose = require('mongoose');
const db = require('../setup/db');

const AuditLog = require('../../src/models/AuditLog');
const audit = require('../../src/services/auditService');

const ADMIN = {
  _id: new mongoose.Types.ObjectId(),
  firstName: 'Ada',
  lastName: 'Obi',
  role: 'Admin',
};

const STUDENT_ID = new mongoose.Types.ObjectId();

// A stand-in for the Express request. `ip` and `get()` are the two things the
// service reads off it.
const fakeReq = (user = ADMIN) => ({
  user,
  ip: '102.89.1.1',
  get: (header) => (header === 'user-agent' ? 'Mozilla/5.0 (test)' : undefined),
});

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
  jest.restoreAllMocks();
});

describe('sanitize', () => {
  it.each([
    'password',
    'newPassword',
    'token',
    'refreshToken',
    'tokenHash',
    'gatewayResponse',
    'apiKey',
  ])('redacts %s', (key) => {
    const result = audit.sanitize({ [key]: 'super-secret-value' });
    expect(result[key]).toBe(audit.REDACTED);
    expect(JSON.stringify(result)).not.toContain('super-secret-value');
  });

  it('redacts regardless of casing', () => {
    const result = audit.sanitize({ PASSWORD: 'hunter2', Token: 'abc' });
    expect(result.PASSWORD).toBe(audit.REDACTED);
    expect(result.Token).toBe(audit.REDACTED);
  });

  it('redacts nested secrets', () => {
    const result = audit.sanitize({
      user: { name: 'Ada', password: 'hunter2' },
    });
    expect(result.user.password).toBe(audit.REDACTED);
    expect(result.user.name).toBe('Ada');
  });

  it('keeps ordinary values intact', () => {
    const result = audit.sanitize({ amount: 45000, status: 'Paid' });
    expect(result).toEqual({ amount: 45000, status: 'Paid' });
  });

  it('summarises a long array rather than copying it', () => {
    const result = audit.sanitize({ students: new Array(50).fill('x') });
    expect(result.students).toBe('[50 items]');
  });

  it('truncates a very long string', () => {
    const result = audit.sanitize({ note: 'x'.repeat(2000) });
    expect(result.note.length).toBeLessThan(600);
  });

  it('stops recursing on deeply nested input', () => {
    const deep = { a: { b: { c: { d: { e: 'too far' } } } } };
    expect(JSON.stringify(audit.sanitize(deep))).toContain('truncated');
  });

  it('renders an ObjectId as a string', () => {
    const id = new mongoose.Types.ObjectId();
    expect(audit.sanitize({ id })).toEqual({ id: String(id) });
  });
});

describe('diff', () => {
  it('records only what changed', () => {
    const changes = audit.diff(
      { ca1: 8, ca2: 7, exam: 50 },
      { ca1: 9, ca2: 7, exam: 50 },
    );

    expect(changes).toEqual({ ca1: { from: 8, to: 9 } });
  });

  it('returns nothing when nothing changed', () => {
    expect(audit.diff({ a: 1 }, { a: 1 })).toEqual({});
  });

  it('notices a field being added', () => {
    expect(audit.diff({}, { grade: 'A' })).toEqual({
      grade: { from: undefined, to: 'A' },
    });
  });

  it('does not report an ObjectId as changed when it is the same', () => {
    const id = new mongoose.Types.ObjectId();
    expect(audit.diff({ ref: id }, { ref: String(id) })).toEqual({});
  });

  it('redacts a secret even inside a diff', () => {
    const changes = audit.diff(
      { password: 'old-secret' },
      { password: 'new-secret' },
    );

    expect(changes.password).toEqual({
      from: audit.REDACTED,
      to: audit.REDACTED,
    });
    expect(JSON.stringify(changes)).not.toContain('secret');
  });
});

describe('record', () => {
  it('writes an entry with the actor, origin and action', async () => {
    await audit.record(fakeReq(), {
      action: 'result.publish',
      entity: 'Result',
      meta: { published: 42 },
    });

    const entry = await AuditLog.findOne({ action: 'result.publish' });

    expect(entry.actorName).toBe('Ada Obi');
    expect(entry.actorRole).toBe('Admin');
    expect(String(entry.actor)).toBe(String(ADMIN._id));
    expect(entry.ip).toBe('102.89.1.1');
    expect(entry.userAgent).toContain('Mozilla');
    expect(entry.meta.published).toBe(42);
    expect(entry.outcome).toBe('success');
  });

  it('links an entry to the student it concerns', async () => {
    await audit.record(fakeReq(), {
      action: 'result.update',
      entity: 'Result',
      subject: STUDENT_ID,
    });

    const entry = await AuditLog.findOne({ subject: STUDENT_ID });
    expect(entry).not.toBeNull();
  });

  it('records a failure with its reason', async () => {
    await audit.record(fakeReq(), {
      action: 'auth.login',
      entity: 'User',
      outcome: 'failure',
      reason: 'Incorrect password',
    });

    const entry = await AuditLog.findOne({ outcome: 'failure' });
    expect(entry.reason).toBe('Incorrect password');
  });

  it('never lets an audit failure break the action it records', async () => {
    // A school must not be blocked from publishing results because a log
    // write failed.
    jest
      .spyOn(AuditLog, 'create')
      .mockRejectedValue(new Error('database on fire'));

    await expect(
      audit.record(fakeReq(), { action: 'result.publish', entity: 'Result' }),
    ).resolves.toBeUndefined();
  });

  it('strips secrets before they reach the database', async () => {
    await audit.record(fakeReq(), {
      action: 'user.create',
      entity: 'User',
      meta: { email: 'ada@school.ng', password: 'plaintext-password' },
    });

    const entry = await AuditLog.findOne({ action: 'user.create' }).lean();

    expect(entry.meta.password).toBe(audit.REDACTED);
    expect(JSON.stringify(entry)).not.toContain('plaintext-password');
  });

  it('works with no signed-in user', async () => {
    await audit.recordAnonymous(
      { ip: '10.0.0.1', get: () => 'curl/8' },
      { action: 'auth.login', entity: 'User', outcome: 'failure' },
    );

    const entry = await AuditLog.findOne({ action: 'auth.login' });
    expect(entry.actor).toBeUndefined();
    expect(entry.ip).toBe('10.0.0.1');
  });
});

describe('the log as a record', () => {
  it('answers "what happened to this student"', async () => {
    await audit.record(fakeReq(), {
      action: 'result.update',
      entity: 'Result',
      subject: STUDENT_ID,
      changes: { ca1: { from: 4, to: 9 } },
    });
    await audit.record(fakeReq(), {
      action: 'payment.manual',
      entity: 'Payment',
      subject: STUDENT_ID,
      meta: { amount: 20000 },
    });
    await audit.record(fakeReq(), {
      action: 'result.update',
      entity: 'Result',
      subject: new mongoose.Types.ObjectId(), // a different student
    });

    const entries = await AuditLog.find({ subject: STUDENT_ID }).sort({
      createdAt: 1,
    });

    expect(entries).toHaveLength(2);
    expect(entries[0].changes.ca1).toEqual({ from: 4, to: 9 });
  });

  it('shows what a score was changed from, and by whom', async () => {
    const teacher = {
      _id: new mongoose.Types.ObjectId(),
      firstName: 'Chi',
      lastName: 'Eze',
      role: 'Teacher',
    };

    await audit.record(fakeReq(teacher), {
      action: 'result.update',
      entity: 'Result',
      subject: STUDENT_ID,
      entityLabel: 'Mathematics',
      changes: audit.diff(
        { ca1: 4, totalScore: 40, grade: 'E' },
        { ca1: 9, totalScore: 45, grade: 'D' },
      ),
    });

    const entry = await AuditLog.findOne({ subject: STUDENT_ID });

    // The whole point of the feature, in one assertion.
    expect(entry.actorName).toBe('Chi Eze');
    expect(entry.entityLabel).toBe('Mathematics');
    expect(entry.changes.grade).toEqual({ from: 'E', to: 'D' });
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('has no updatedAt — entries are not meant to be edited', async () => {
    await audit.record(fakeReq(), { action: 'user.delete', entity: 'User' });

    const entry = await AuditLog.findOne({}).lean();
    expect(entry.createdAt).toBeDefined();
    expect(entry.updatedAt).toBeUndefined();
  });
});
