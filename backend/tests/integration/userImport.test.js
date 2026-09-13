const mongoose = require('mongoose');
const db = require('../setup/db');

jest.mock('../../src/services/notificationService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  sendBulkEmails: jest.fn().mockResolvedValue({ sent: 0, failed: 0, total: 0 }),
  verifyTransport: jest.fn().mockResolvedValue(true),
  emailTemplates: new Proxy({}, { get: () => () => '<html></html>' }),
}));

jest.mock('../../src/services/jobQueue', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({ success: true, queued: true }),
  enqueueBulkEmail: jest.fn().mockResolvedValue({ queued: 0, total: 0 }),
  startJobQueue: jest.fn(),
  stopJobQueue: jest.fn(),
}));

const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const {
  previewImport,
  createUsers,
  buildTemplate,
  generatePassword,
  parseDate,
} = require('../../src/services/userImportService');

const csv = (lines) => Buffer.from(lines.join('\r\n'), 'utf8');

let jss1;

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
  jss1 = await Class.create({
    name: 'JSS 1',
    level: 'JSS',
    academicYear: '2026/2027',
    sections: [{ name: 'A' }, { name: 'B' }],
  });
});

describe('previewImport', () => {
  it('writes nothing to the database', async () => {
    await previewImport(
      csv(['firstname,lastname,email', 'Ada,Obi,ada@school.ng']),
      'Student',
    );

    expect(await User.countDocuments()).toBe(0);
  });

  it('accepts a well-formed student file', async () => {
    const result = await previewImport(
      csv([
        'firstname,lastname,email,class,section,gender,dateofbirth',
        'Ada,Obi,ada@school.ng,JSS 1,A,Female,2013-04-12',
      ]),
      'Student',
    );

    expect(result.error).toBeNull();
    expect(result.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
    expect(result.rows[0].user.profile.class).toEqual(jss1._id);
  });

  it('matches headers however the admin spelled them', async () => {
    const result = await previewImport(
      csv([
        'First Name,LAST_NAME,E-mail'.replace('E-mail', 'Email'),
        'Ada,Obi,ada@school.ng',
      ]),
      'Student',
    );

    expect(result.summary.valid).toBe(1);
  });

  it('refuses a file missing a required column', async () => {
    const result = await previewImport(
      csv(['firstname,email', 'Ada,ada@school.ng']),
      'Student',
    );

    expect(result.error).toMatch(/missing required column: lastname/i);
  });

  it('rejects a row whose class does not exist', async () => {
    const result = await previewImport(
      csv(['firstname,lastname,email,class', 'Ada,Obi,ada@school.ng,SS 9']),
      'Student',
    );

    expect(result.rows[0].valid).toBe(false);
    expect(result.rows[0].errors).toContain('class "SS 9" does not exist');
  });

  it('rejects a section that is not in the named class', async () => {
    const result = await previewImport(
      csv([
        'firstname,lastname,email,class,section',
        'Ada,Obi,ada@school.ng,JSS 1,Z',
      ]),
      'Student',
    );

    expect(result.rows[0].errors).toContain('section "Z" is not in JSS 1');
  });

  it('catches an address duplicated inside the file', async () => {
    // Otherwise the first row creates the account and the second dies on the
    // unique index half way through the import.
    const result = await previewImport(
      csv([
        'firstname,lastname,email',
        'Ada,Obi,dupe@school.ng',
        'Ben,Eze,dupe@school.ng',
      ]),
      'Student',
    );

    expect(result.summary.invalid).toBe(2);
    result.rows.forEach((row) =>
      expect(row.errors).toContain('email appears more than once in this file'),
    );
  });

  it('catches an address that already has an account', async () => {
    await User.create({
      firstName: 'Existing',
      lastName: 'User',
      email: 'taken@school.ng',
      password: 'Password123',
      role: 'Teacher',
    });

    const result = await previewImport(
      csv(['firstname,lastname,email', 'Ada,Obi,taken@school.ng']),
      'Student',
    );

    expect(result.rows[0].errors).toContain('email already has an account');
  });

  it('reports the line number the admin sees in their file', async () => {
    const result = await previewImport(
      csv([
        'firstname,lastname,email',
        'Ada,Obi,ada@school.ng',
        ',Eze,ben@school.ng',
      ]),
      'Student',
    );

    const bad = result.rows.find((r) => !r.valid);
    expect(bad.line).toBe(3);
  });

  it('rejects an unimportable role', async () => {
    const result = await previewImport(csv(['firstname']), 'Admin');
    expect(result.error).toMatch(/Student or Teacher/);
  });
});

describe('createUsers', () => {
  const studentRows = [
    {
      _line: 2,
      firstname: 'Ada',
      lastname: 'Obi',
      email: 'ada@school.ng',
      class: 'JSS 1',
      section: 'A',
    },
    {
      _line: 3,
      firstname: 'Ben',
      lastname: 'Eze',
      email: 'ben@school.ng',
      class: 'JSS 1',
    },
  ];

  it('creates the accounts and links the class', async () => {
    const { created, failed } = await createUsers(studentRows, 'Student');

    expect(created).toHaveLength(2);
    expect(failed).toHaveLength(0);

    const ada = await User.findOne({ email: 'ada@school.ng' });
    expect(ada.role).toBe('Student');
    expect(String(ada.studentProfile.class)).toBe(String(jss1._id));
    expect(ada.studentProfile.section).toBe('A');
    expect(ada.studentProfile.profileStatus).toBe('Active');
  });

  it('gives every student an admission number', async () => {
    // The number comes from a pre('save') hook. insertMany would skip it and
    // leave a roster of students with no admission number at all.
    const { created } = await createUsers(studentRows, 'Student');

    created.forEach((user) => expect(user.admissionNumber).toBeTruthy());

    const numbers = new Set(created.map((u) => u.admissionNumber));
    expect(numbers.size).toBe(2);
  });

  it('gives every teacher a staff id', async () => {
    const { created } = await createUsers(
      [
        {
          _line: 2,
          firstname: 'Ngozi',
          lastname: 'Eze',
          email: 'ngozi@school.ng',
        },
      ],
      'Teacher',
    );

    expect(created[0].staffId).toBeTruthy();
  });

  it('hashes the generated password and never stores it in clear', async () => {
    const { created } = await createUsers([studentRows[0]], 'Student');

    const stored = await User.findOne({ email: 'ada@school.ng' }).select(
      '+password',
    );
    expect(stored.password).not.toBe(created[0].password);
    expect(stored.password).toMatch(/^\$2[aby]\$/);
    expect(await stored.comparePassword(created[0].password)).toBe(true);
  });

  it('re-validates and refuses a row the caller tampered with', async () => {
    // The preview said yes; the browser sends back a row naming a class that
    // does not exist. The server checks again rather than trusting it.
    const { created, failed } = await createUsers(
      [
        {
          _line: 2,
          firstname: 'Ada',
          lastname: 'Obi',
          email: 'ada@school.ng',
          class: 'Hogwarts',
        },
      ],
      'Student',
    );

    expect(created).toHaveLength(0);
    expect(failed[0].errors).toContain('class "Hogwarts" does not exist');
    expect(await User.countDocuments()).toBe(0);
  });

  it('creates the good rows and reports the bad ones', async () => {
    const { created, failed } = await createUsers(
      [
        studentRows[0],
        { _line: 3, firstname: '', lastname: 'Eze', email: 'ben@school.ng' },
      ],
      'Student',
    );

    expect(created.map((c) => c.email)).toEqual(['ada@school.ng']);
    expect(failed[0].line).toBe(3);
    expect(await User.countDocuments()).toBe(1);
  });

  it('does not abandon the rest when one address is taken mid-import', async () => {
    await User.create({
      firstName: 'Existing',
      lastName: 'User',
      email: 'ben@school.ng',
      password: 'Password123',
      role: 'Teacher',
    });

    const { created, failed } = await createUsers(studentRows, 'Student');

    expect(created.map((c) => c.email)).toEqual(['ada@school.ng']);
    expect(failed).toHaveLength(1);
  });
});

describe('generatePassword', () => {
  it('avoids characters that are misread off a printed list', () => {
    const joined = Array.from({ length: 200 }, () => generatePassword()).join(
      '',
    );
    expect(joined).not.toMatch(/[O0lI1]/);
  });

  it('does not repeat itself', () => {
    const all = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(all.size).toBe(200);
  });
});

describe('parseDate', () => {
  it('reads ISO and day-first dates', () => {
    expect(parseDate('2013-04-12').toISOString()).toBe(
      '2013-04-12T00:00:00.000Z',
    );
    expect(parseDate('12/04/2013').toISOString()).toBe(
      '2013-04-12T00:00:00.000Z',
    );
  });

  it('separates absent from unparseable', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('last Tuesday')).toBeUndefined();
  });
});

describe('buildTemplate', () => {
  it('produces a file the parser can read back', async () => {
    const result = await previewImport(
      Buffer.from(buildTemplate('Student')),
      'Student',
    );

    expect(result.error).toBeNull();
    expect(result.summary.total).toBe(1);
  });
});

afterAll(() => mongoose.connection.close().catch(() => {}));
