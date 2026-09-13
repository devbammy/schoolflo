const crypto = require('crypto');
const User = require('../models/User');
const Class = require('../models/Class');
const { parseCsv, toCsv } = require('../utils/csv');

/**
 * Turning a spreadsheet into accounts.
 *
 * Two passes, deliberately separated. `validateRows` reads the file and says
 * what it would do; `createUsers` does it. The admin sees the first and
 * approves the second, so a malformed date on row 147 is something they fix
 * before anything is written rather than something they discover afterwards
 * in a list of half-created accounts.
 *
 * The commit step re-validates from scratch. The preview's verdict is a
 * courtesy to the person reading it, never an input the server trusts — the
 * browser could send back anything, and between the two calls another admin
 * may have taken the email address.
 */

const IMPORTABLE_ROLES = ['Student', 'Teacher'];

// What a row may carry, per role. Anything else in the file is ignored rather
// than rejected: schools export from systems that add columns nobody asked for.
const COLUMNS = {
  Student: {
    required: ['firstname', 'lastname', 'email'],
    optional: ['phone', 'class', 'section', 'gender', 'dateofbirth', 'address'],
  },
  Teacher: {
    required: ['firstname', 'lastname', 'email'],
    optional: ['phone', 'qualification', 'specialization', 'designation'],
  },
};

const GENDERS = ['Male', 'Female', 'Other'];

// Deliberately loose. The authority on whether an address works is whether the
// welcome email arrives; a clever regex here only rejects valid addresses.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A password the admin never chooses and never sees.
 *
 * Ambiguous characters are left out because these get read off a printed list
 * and typed by a eleven-year-old: no O/0, no l/1/I.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

const generatePassword = (length = 10) => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
};

/** "12/03/2011" and "2011-03-12" both appear in real exports. */
const parseDate = (value) => {
  if (!value) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  // Day first, which is how Nigerian schools write dates.
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (dmy) {
    const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  return undefined; // present but unparseable — distinct from absent
};

const titleCase = (value) =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

/**
 * Validate every row against the file, the database and the role's rules.
 *
 * Returns one entry per row in file order, so the admin's preview table lines
 * up with their spreadsheet.
 */
const validateRows = async (rows, role) => {
  // Classes are matched by name, because that is what a spreadsheet holds.
  const classes = await Class.find({ isActive: true })
    .select('name sections')
    .lean();
  const classByName = new Map(
    classes.map((c) => [String(c.name).trim().toLowerCase(), c]),
  );

  const emails = rows
    .map((r) =>
      String(r.email || '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  const taken = new Set(
    (
      await User.find({ email: { $in: emails } })
        .select('email')
        .lean()
    ).map((u) => String(u.email).toLowerCase()),
  );

  // A file that lists the same address twice would otherwise pass validation
  // and then fail half way through creation on the unique index.
  const seen = new Map();
  emails.forEach((email) => seen.set(email, (seen.get(email) || 0) + 1));

  return rows.map((row) => {
    const errors = [];
    const email = String(row.email || '')
      .trim()
      .toLowerCase();
    const firstName = String(row.firstname || '').trim();
    const lastName = String(row.lastname || '').trim();

    COLUMNS[role].required.forEach((field) => {
      if (!String(row[field] || '').trim()) errors.push(`${field} is required`);
    });

    if (email && !EMAIL_SHAPE.test(email))
      errors.push('email is not a valid address');
    if (email && taken.has(email)) errors.push('email already has an account');
    if (email && seen.get(email) > 1)
      errors.push('email appears more than once in this file');

    const profile = {};

    if (role === 'Student') {
      const className = String(row.class || '').trim();
      if (className) {
        const found = classByName.get(className.toLowerCase());
        if (!found) errors.push(`class "${className}" does not exist`);
        else {
          profile.class = found._id;

          const section = String(row.section || '').trim();
          if (section) {
            const valid = (found.sections || []).some(
              (s) => String(s.name).toLowerCase() === section.toLowerCase(),
            );
            if (!valid)
              errors.push(`section "${section}" is not in ${found.name}`);
            else profile.section = section;
          }
        }
      } else if (String(row.section || '').trim()) {
        errors.push('section given without a class');
      }

      const gender = String(row.gender || '').trim();
      if (gender) {
        const normalized = titleCase(gender);
        if (!GENDERS.includes(normalized))
          errors.push(`gender must be one of ${GENDERS.join(', ')}`);
        else profile.gender = normalized;
      }

      const dobRaw = String(row.dateofbirth || '').trim();
      if (dobRaw) {
        const dob = parseDate(dobRaw);
        if (dob === undefined)
          errors.push('dateOfBirth must be YYYY-MM-DD or DD/MM/YYYY');
        else if (dob > new Date()) errors.push('dateOfBirth is in the future');
        else profile.dateOfBirth = dob;
      }

      const address = String(row.address || '').trim();
      if (address) profile.address = address;
    }

    if (role === 'Teacher') {
      ['qualification', 'specialization', 'designation'].forEach((field) => {
        const value = String(row[field] || '').trim();
        if (value) profile[field] = value;
      });
    }

    return {
      line: row._line,
      valid: errors.length === 0,
      errors,
      // The row exactly as it came out of the file. The client sends these
      // back on commit and the server validates them again from scratch, so
      // the preview never becomes an input the server has to trust.
      raw: row,
      user: {
        firstName,
        lastName,
        email,
        phone: String(row.phone || '').trim() || undefined,
        role,
        profile,
      },
    };
  });
};

/**
 * Read an uploaded file and validate it, without writing anything.
 */
const previewImport = async (buffer, role) => {
  if (!IMPORTABLE_ROLES.includes(role)) {
    return { error: `Role must be one of ${IMPORTABLE_ROLES.join(' or ')}.` };
  }

  const { headers, rows, error } = parseCsv(buffer.toString('utf8'));
  if (error) return { error };

  const missing = COLUMNS[role].required.filter((h) => !headers.includes(h));
  if (missing.length) {
    return {
      error: `The file is missing required ${
        missing.length > 1 ? 'columns' : 'column'
      }: ${missing.join(', ')}. Download the template to see the expected format.`,
    };
  }

  const results = await validateRows(rows, role);

  return {
    error: null,
    role,
    headers,
    rows: results,
    summary: {
      total: results.length,
      valid: results.filter((r) => r.valid).length,
      invalid: results.filter((r) => !r.valid).length,
    },
  };
};

/**
 * Create the accounts for rows that are still valid at this moment.
 *
 * One `User.create` per row rather than `insertMany`: admission numbers and
 * staff IDs are generated in a pre('save') hook, and insertMany does not run
 * save middleware, so a bulk insert would quietly produce students with no
 * admission number at all.
 */
const createUsers = async (rows, role) => {
  const validated = await validateRows(rows, role);

  const created = [];
  const failed = [];

  for (const entry of validated) {
    if (!entry.valid) {
      failed.push({
        line: entry.line,
        email: entry.user.email,
        errors: entry.errors,
      });
      continue;
    }

    const password = generatePassword();
    const { firstName, lastName, email, phone, profile } = entry.user;

    try {
      const user = await User.create({
        firstName,
        lastName,
        email,
        password,
        phone,
        role,
        studentProfile:
          role === 'Student'
            ? { ...profile, profileStatus: 'Active' }
            : undefined,
        teacherProfile: role === 'Teacher' ? profile : undefined,
      });

      created.push({
        line: entry.line,
        _id: user._id,
        firstName,
        lastName,
        email,
        password, // handed to the caller for the welcome email, never stored
        admissionNumber: user.studentProfile?.admissionNumber,
        staffId: user.teacherProfile?.staffId,
      });
    } catch (err) {
      // A unique-index collision here means someone took the address between
      // the preview and now. One row failing must not abandon the rest.
      failed.push({
        line: entry.line,
        email,
        errors: [
          err?.code === 11000
            ? 'email was taken while this import was being reviewed'
            : err.message,
        ],
      });
    }
  }

  return { created, failed };
};

/** The CSV an admin downloads to see what the importer expects. */
const buildTemplate = (role) => {
  const { required, optional } = COLUMNS[role];
  const headers = [...required, ...optional];

  const examples = {
    Student: [
      [
        'Ada',
        'Obi',
        'ada.obi@example.com',
        '08030000000',
        'JSS 1',
        'A',
        'Female',
        '2013-04-12',
        '12 Broad Street, Lagos',
      ],
    ],
    Teacher: [
      [
        'Ngozi',
        'Eze',
        'ngozi.eze@example.com',
        '08030000001',
        'B.Ed Mathematics',
        'Mathematics',
        'Senior Teacher',
      ],
    ],
  };

  return toCsv(headers, examples[role]);
};

module.exports = {
  IMPORTABLE_ROLES,
  COLUMNS,
  previewImport,
  createUsers,
  validateRows,
  buildTemplate,
  generatePassword,
  parseDate,
};
