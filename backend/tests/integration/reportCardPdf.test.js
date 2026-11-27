/**
 * The Report Card certificate and the school details it prints: the PDF is
 * drawn on the school's design from the same figures as the portal's card,
 * the logo is public while the signature never is, and a downloaded report
 * card is held back exactly as the results page is.
 */

const request = require('supertest');
const express = require('express');
require('express-async-errors');
const db = require('../setup/db');

jest.mock('../../src/services/jobQueue', () => ({
  enqueueEmail: jest.fn().mockResolvedValue(undefined),
  startJobQueue: jest.fn(),
}));

const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const Subject = require('../../src/models/Subject');
const Certificate = require('../../src/models/Certificate');
const SchoolSettings = require('../../src/models/SchoolSettings');
const { ReportRemark } = require('../../src/models/ReportRemark');
const { Result } = require('../../src/models/Exam');
const errorHandler = require('../../src/middleware/errorHandler');
const pdfService = require('../../src/services/pdfService');
const {
  getSettings,
  updateSettings,
  uploadImage,
  serveLogo,
  signatureDataUrl,
} = require('../../src/controllers/schoolSettingsController');
const {
  downloadCertificate,
} = require('../../src/controllers/certificateController');

const YEAR = '2024/2025';

// Documents refuse to print without the school's name (see schoolIdentity).
process.env.SCHOOL_NAME = 'Test School';

// The smallest valid PNG: 1x1, transparent.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let actingUser;
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
// The real route runs multer; here the file arrives already parsed.
app.put(
  '/school-settings/:image',
  (req, res, next) => {
    req.file = { buffer: PNG, mimetype: 'image/png', size: PNG.length };
    next();
  },
  uploadImage,
);
app.get('/school-settings', getSettings);
app.put('/school-settings', updateSettings);
app.get('/config/logo', serveLogo);
app.get('/certificates/:id/download', downloadCertificate);
app.use(errorHandler);

let admin;
let student;
let basic1;
let jss1;

const makeResults = async (who, classDoc, term, totals) => {
  const subjects = await Subject.find().sort({ code: 1 });
  for (const [i, total] of totals.entries()) {
    await Result.create({
      student: who._id,
      class: classDoc._id,
      subject: subjects[i]._id,
      term,
      academicYear: YEAR,
      isPublished: true,
      scores: {
        exam: Math.min(total, 60),
        ca1: Math.max(0, Math.min(total - 60, 10)),
        ca2: Math.max(0, Math.min(total - 70, 10)),
      },
    });
  }
};

beforeAll(db.connect);
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  admin = await User.create({
    firstName: 'Head',
    lastName: 'Admin',
    email: 'admin@school.ng',
    password: 'password123',
    role: 'Admin',
  });
  basic1 = await Class.create({
    name: 'Basic 1',
    level: 'Primary',
    sections: [{ name: 'A' }],
  });
  jss1 = await Class.create({ name: 'JSS 1', level: 'JSS' });
  await Subject.create({ name: 'English', code: 'ENG' });
  await Subject.create({ name: 'Mathematics', code: 'MTH' });
  student = await User.create({
    firstName: 'Ada',
    lastName: 'Obi',
    password: 'password123',
    role: 'Student',
    studentProfile: { class: basic1._id, section: 'A' },
  });
  actingUser = admin;
});

describe('the Report Card PDF', () => {
  it('draws a first-term primary card', async () => {
    await makeResults(student, basic1, 'First Term', [70, 65]);
    const { buffer: pdf } = await pdfService.generateReportCard(
      student._id,
      'First Term',
      YEAR,
    );
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('draws a third-term college card with cumulative columns, remarks, logo and signature', async () => {
    const senior = await User.create({
      firstName: 'Emeka',
      lastName: 'Eze',
      password: 'password123',
      role: 'Student',
      studentProfile: { class: jss1._id },
    });
    for (const term of ['First Term', 'Second Term', 'Third Term']) {
      await makeResults(senior, jss1, term, [80, 55]);
    }
    await ReportRemark.create({
      student: senior._id,
      class: jss1._id,
      term: 'Third Term',
      academicYear: YEAR,
      behaviour: { punctuality: 'Excellent', neatness: 'Good' },
      teacherComment: 'A steady worker.',
      enteredBy: admin._id,
    });
    await SchoolSettings.create({
      key: 'school',
      address: '1 School Road',
      logo: { data: PNG, contentType: 'image/png', updatedAt: new Date() },
      signature: { data: PNG, contentType: 'image/png', updatedAt: new Date() },
    });

    const { buffer: pdf } = await pdfService.generateReportCard(
      senior._id,
      'Third Term',
      YEAR,
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('refuses a term with nothing published, and says why', async () => {
    await Result.create({
      student: student._id,
      class: basic1._id,
      subject: (await Subject.findOne())._id,
      term: 'First Term',
      academicYear: YEAR,
      scores: { exam: 50 },
    });
    await expect(
      pdfService.generateReportCard(student._id, 'First Term', YEAR),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('school details', () => {
  it('saves the address and contacts', async () => {
    const res = await request(app)
      .put('/school-settings')
      .send({ address: '1 School Road', phones: '0800' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      address: '1 School Road',
      phones: '0800',
      hasLogo: false,
      hasSignature: false,
    });
  });

  it('serves the logo publicly once uploaded', async () => {
    expect((await request(app).get('/config/logo')).status).toBe(404);
    const up = await request(app).put('/school-settings/logo');
    expect(up.body.data.hasLogo).toBe(true);

    const logo = await request(app).get('/config/logo');
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(logo.body, PNG)).toBe(0);
  });

  it('never sends the signature bytes in the settings, only inside a card', async () => {
    await request(app).put('/school-settings/signature');
    const res = await request(app).get('/school-settings');
    expect(res.body.data.hasSignature).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/base64|iVBOR/);

    expect(await signatureDataUrl()).toBe(
      `data:image/png;base64,${PNG.toString('base64')}`,
    );
  });

  it('refuses an unknown image name', async () => {
    const res = await request(app).put('/school-settings/stamp');
    expect(res.status).toBe(404);
  });
});

describe('downloading a Report Card certificate', () => {
  let certificate;

  beforeEach(async () => {
    certificate = await Certificate.create({
      certificateType: 'Report Card',
      student: student._id,
      class: basic1._id,
      term: 'First Term',
      academicYear: YEAR,
      data: { term: 'First Term' },
      issuedBy: admin._id,
      status: 'Issued',
      pdfData: Buffer.from('%PDF-1.3 test'),
    });
  });

  it('is served to the student while their results are open', async () => {
    actingUser = student;
    const res = await request(app).get(
      `/certificates/${certificate._id}/download`,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  it('is withheld from the student exactly as the results page is', async () => {
    await User.updateOne(
      { _id: student._id },
      { 'studentProfile.resultsWithheld': { by: admin._id, at: new Date() } },
    );
    actingUser = await User.findById(student._id);
    const res = await request(app).get(
      `/certificates/${certificate._id}/download`,
    );
    expect(res.status).toBe(403);
    expect(res.body.errors).toMatchObject({ reason: 'RESULTS_WITHHELD' });
  });

  it('is still served to an admin when withheld', async () => {
    await User.updateOne(
      { _id: student._id },
      { 'studentProfile.resultsWithheld': { by: admin._id, at: new Date() } },
    );
    const res = await request(app).get(
      `/certificates/${certificate._id}/download`,
    );
    expect(res.status).toBe(200);
  });
});
