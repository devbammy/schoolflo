const fs = require('fs');
const path = require('path');
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

const Class = require('../../src/models/Class');
const {
  previewImport,
  COLUMNS,
} = require('../../src/services/userImportService');

/**
 * CSV_IMPORT.md is what a school admin reads before building their
 * spreadsheet, so a column renamed in the code and not in the doc sends them
 * to fix a file that was never wrong. These run the doc's own worked example
 * through the real validator and check its column tables against the code.
 */

const DOC_PATH = path.join(__dirname, '..', '..', '..', 'CSV_IMPORT.md');
const doc = fs.readFileSync(DOC_PATH, 'utf8');

/** The fenced ```csv block under a given heading. */
const csvBlockUnder = (heading) => {
  const section = doc.split(heading)[1];
  if (!section) return null;
  const match = /```csv\n([\s\S]*?)```/.exec(section);
  return match ? match[1].trimEnd() : null;
};

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
  await Class.create({
    name: 'JSS 1',
    level: 'JSS',
    academicYear: '2026/2027',
    sections: [{ name: 'A' }, { name: 'B' }],
  });
  await Class.create({
    name: 'JSS 2',
    level: 'JSS',
    academicYear: '2026/2027',
    sections: [{ name: 'A' }],
  });
});

describe('CSV_IMPORT.md worked example', () => {
  const example = csvBlockUnder('## Worked example');

  it('is present in the document', () => {
    expect(example).toBeTruthy();
  });

  it('imports cleanly, as the document promises', async () => {
    const result = await previewImport(Buffer.from(example, 'utf8'), 'Student');

    expect(result.error).toBeNull();
    // Surface the actual complaint if this ever breaks, rather than "2 !== 1".
    expect(
      result.rows.filter((r) => !r.valid).map((r) => r.errors.join('; ')),
    ).toEqual([]);
    expect(result.summary.valid).toBe(2);
  });

  it('links both siblings to one parent, as the document promises', async () => {
    const result = await previewImport(Buffer.from(example, 'utf8'), 'Student');
    const parents = result.rows.map((r) => r.parent?.email);

    expect(parents.every(Boolean)).toBe(true);
    expect(new Set(parents).size).toBe(1);
    expect(result.rows[0].parent.exists).toBe(false);
  });

  it('tolerates the blank optional column the document points out', async () => {
    const result = await previewImport(Buffer.from(example, 'utf8'), 'Student');

    expect(result.rows[1].user.phone).toBeUndefined();
  });

  it('keeps the quoted comma in the address, as the document points out', async () => {
    const result = await previewImport(Buffer.from(example, 'utf8'), 'Student');

    expect(result.rows[0].user.profile.address).toBe('12 Broad Street, Lagos');
  });
});

describe('CSV_IMPORT.md sibling example', () => {
  it('does what the Parents section says it does', async () => {
    const example = csvBlockUnder('### Two children, one parent');
    expect(example).toBeTruthy();

    const result = await previewImport(Buffer.from(example, 'utf8'), 'Student');

    expect(result.summary.valid).toBe(2);
    expect(new Set(result.rows.map((r) => r.parent.email)).size).toBe(1);
  });
});

describe('CSV_IMPORT.md column tables', () => {
  // Every column the doc lists in a table row like: | `firstname` | ... |
  const documented = new Set(
    [...doc.matchAll(/^\| `([a-z]+)` \|/gm)].map((m) => m[1]),
  );

  const real = [
    ...COLUMNS.Student.required,
    ...COLUMNS.Student.optional,
    ...COLUMNS.Teacher.required,
    ...COLUMNS.Teacher.optional,
  ];

  it.each(real)('documents the %s column', (column) => {
    expect([...documented]).toContain(column);
  });

  it('does not describe a column the importer ignores', () => {
    const invented = [...documented].filter((c) => !real.includes(c));
    expect(invented).toEqual([]);
  });
});

describe('CSV_IMPORT.md stated limits', () => {
  it('quotes the real row cap', () => {
    const { MAX_ROWS } = require('../../src/utils/csv');
    expect(doc).toContain(MAX_ROWS.toLocaleString('en-US'));
  });
});
