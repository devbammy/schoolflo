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
    expect(result.summary.valid).toBe(result.summary.total);
  });

  it('demonstrates siblings sharing one parent', async () => {
    // The template is the only place an admin learns that repeating a parent
    // email links one parent to both children rather than erroring.
    const result = await previewImport(
      Buffer.from(buildTemplate('Student')),
      'Student',
    );

    const parentEmails = result.rows.map((r) => r.parent?.email);
    expect(parentEmails).toHaveLength(2);
    expect(new Set(parentEmails).size).toBe(1);
  });
});

describe('parent columns', () => {
  const withParent = (rows) =>
    csv([
      'firstname,lastname,email,parentfirstname,parentlastname,parentemail,parentrelationship',
      ...rows,
    ]);

  it('treats a row with no parent columns as before', async () => {
    const result = await previewImport(
      csv(['firstname,lastname,email', 'Ada,Obi,ada@school.ng']),
      'Student',
    );

    expect(result.rows[0].valid).toBe(true);
    expect(result.rows[0].parent).toBeNull();
  });

  it('requires an address once any parent column is filled', async () => {
    const result = await previewImport(
      withParent(['Ada,Obi,ada@school.ng,Chinwe,Obi,,Mother']),
      'Student',
    );

    expect(result.rows[0].errors).toContain(
      'parentEmail is required when a parent is named',
    );
  });

  it('requires a name for a parent that does not exist yet', async () => {
    const result = await previewImport(
      csv([
        'firstname,lastname,email,parentemail',
        'Ada,Obi,ada@school.ng,chinwe@school.ng',
      ]),
      'Student',
    );

    expect(result.rows[0].errors).toContain(
      'parentFirstName is required for a new parent',
    );
  });

  it('needs only the address to link an existing parent', async () => {
    await User.create({
      firstName: 'Chinwe',
      lastName: 'Obi',
      email: 'chinwe@school.ng',
      password: 'Password123',
      role: 'Parent',
    });

    const result = await previewImport(
      csv([
        'firstname,lastname,email,parentemail',
        'Ada,Obi,ada@school.ng,chinwe@school.ng',
      ]),
      'Student',
    );

    expect(result.rows[0].valid).toBe(true);
    expect(result.rows[0].parent.exists).toBe(true);
  });

  it('refuses an address that belongs to another role', async () => {
    // One account, one role. A teacher's address cannot quietly become a
    // parent account as well.
    await User.create({
      firstName: 'Ngozi',
      lastName: 'Eze',
      email: 'ngozi@school.ng',
      password: 'Password123',
      role: 'Teacher',
    });

    const result = await previewImport(
      withParent(['Ada,Obi,ada@school.ng,Ngozi,Eze,ngozi@school.ng,Mother']),
      'Student',
    );

    expect(result.rows[0].errors).toContain(
      'parentEmail already belongs to a Teacher account',
    );
  });

  it('refuses a parent address that is also the student', async () => {
    const result = await previewImport(
      withParent(['Ada,Obi,ada@school.ng,Chinwe,Obi,ada@school.ng,Mother']),
      'Student',
    );

    expect(result.rows[0].errors).toContain(
      'parentEmail cannot be the same as the student email',
    );
  });

  it('refuses a parent address used as a student elsewhere in the file', async () => {
    const result = await previewImport(
      withParent([
        'Ada,Obi,ada@school.ng,Chinwe,Obi,ben@school.ng,Mother',
        'Ben,Eze,ben@school.ng,Ada,Eze,other@school.ng,Father',
      ]),
      'Student',
    );

    expect(result.rows[0].errors).toContain(
      'parentEmail is used as a student email in this file',
    );
  });

  it('validates the relationship', async () => {
    const result = await previewImport(
      withParent(['Ada,Obi,ada@school.ng,Chinwe,Obi,chinwe@school.ng,Cousin']),
      'Student',
    );

    expect(result.rows[0].errors[0]).toMatch(/parentRelationship must be/);
  });
});

describe('creating parents', () => {
  const sibling = (first, email) => ({
    _line: 2,
    firstname: first,
    lastname: 'Obi',
    email,
    parentfirstname: 'Chinwe',
    parentlastname: 'Obi',
    parentemail: 'chinwe@school.ng',
    parentrelationship: 'Mother',
  });

  it('creates the parent and links both directions', async () => {
    // The portal reads the relationship from both ends, so one direction
    // alone produces an account that works for the parent but not the child.
    const { created, parentsCreated } = await createUsers(
      [sibling('Ada', 'ada@school.ng')],
      'Student',
    );

    const parent = await User.findOne({ email: 'chinwe@school.ng' });
    const student = await User.findById(created[0]._id);

    expect(parent.role).toBe('Parent');
    expect(parent.parentProfile.relationship).toBe('Mother');
    expect(parent.parentProfile.children.map(String)).toEqual([
      String(student._id),
    ]);
    expect(String(student.studentProfile.parentId)).toBe(String(parent._id));

    expect(parentsCreated).toHaveLength(1);
    expect(created[0].parentLinked).toBe(true);
  });

  it('puts siblings under one parent account', async () => {
    const { parentsCreated } = await createUsers(
      [
        sibling('Ada', 'ada@school.ng'),
        { ...sibling('Emeka', 'emeka@school.ng'), _line: 3 },
      ],
      'Student',
    );

    expect(parentsCreated).toHaveLength(1);
    expect(await User.countDocuments({ role: 'Parent' })).toBe(1);

    const parent = await User.findOne({ email: 'chinwe@school.ng' });
    expect(parent.parentProfile.children).toHaveLength(2);
  });

  it('reuses a parent that already existed and does not re-issue a password', async () => {
    const existing = await User.create({
      firstName: 'Chinwe',
      lastName: 'Obi',
      email: 'chinwe@school.ng',
      password: 'Password123',
      role: 'Parent',
    });

    const { parentsCreated } = await createUsers(
      [sibling('Ada', 'ada@school.ng')],
      'Student',
    );

    // Nothing was created, so nothing gets a welcome email — resending would
    // be a password change nobody asked for.
    expect(parentsCreated).toHaveLength(0);

    const parent = await User.findById(existing._id);
    expect(parent.parentProfile.children).toHaveLength(1);
  });

  it('generates a password for the parent and hashes it', async () => {
    const { parentsCreated } = await createUsers(
      [sibling('Ada', 'ada@school.ng')],
      'Student',
    );

    const stored = await User.findOne({ email: 'chinwe@school.ng' }).select(
      '+password',
    );

    expect(parentsCreated[0].password).toBeTruthy();
    expect(await stored.comparePassword(parentsCreated[0].password)).toBe(true);
  });

  it('still enrols the student when the row names no parent', async () => {
    const { created, parentsCreated } = await createUsers(
      [{ _line: 2, firstname: 'Ada', lastname: 'Obi', email: 'ada@school.ng' }],
      'Student',
    );

    expect(created).toHaveLength(1);
    expect(created[0].parentLinked).toBeUndefined();
    expect(parentsCreated).toHaveLength(0);
  });
});

afterAll(() => mongoose.connection.close().catch(() => {}));
