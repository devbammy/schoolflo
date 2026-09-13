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
    optional: [
      'phone',
      'class',
      'section',
      'gender',
      'dateofbirth',
      'address',
      // A parent is optional, but naming one commits you to an address: an
      // account cannot exist without somewhere to send its password.
      'parentfirstname',
      'parentlastname',
      'parentemail',
      'parentphone',
      'parentrelationship',
    ],
  },
  Teacher: {
    required: ['firstname', 'lastname', 'email'],
    optional: ['phone', 'qualification', 'specialization', 'designation'],
  },
};

const GENDERS = ['Male', 'Female', 'Other'];
const RELATIONSHIPS = ['Father', 'Mother', 'Guardian', 'Other'];

// The parent columns on a student row. Any one of them means "this row names
// a parent", which is what makes the email mandatory rather than optional.
const PARENT_FIELDS = [
  'parentfirstname',
  'parentlastname',
  'parentemail',
  'parentphone',
  'parentrelationship',
];

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

  // Parent addresses are looked up too, but an existing one is not an error —
  // it is the whole mechanism by which two siblings end up under one parent.
  // What matters is the role behind the address.
  const parentEmails = rows
    .map((r) =>
      String(r.parentemail || '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  const existingByEmail = new Map(
    (
      await User.find({ email: { $in: parentEmails } })
        .select('email role')
        .lean()
    ).map((u) => [String(u.email).toLowerCase(), u]),
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

    // ── The parent named on this row, if any ─────────────────────────────
    let parent = null;

    if (role === 'Student') {
      const named = PARENT_FIELDS.some((field) =>
        String(row[field] || '').trim(),
      );

      if (named) {
        const parentEmail = String(row.parentemail || '')
          .trim()
          .toLowerCase();
        const parentFirst = String(row.parentfirstname || '').trim();
        const parentLast = String(row.parentlastname || '').trim();

        if (!parentEmail) {
          errors.push('parentEmail is required when a parent is named');
        } else if (!EMAIL_SHAPE.test(parentEmail)) {
          errors.push('parentEmail is not a valid address');
        } else if (parentEmail === email) {
          errors.push('parentEmail cannot be the same as the student email');
        } else if (seen.get(parentEmail)) {
          // The address is also a student in this file, so it cannot be both.
          errors.push('parentEmail is used as a student email in this file');
        }

        const found = existingByEmail.get(parentEmail);

        if (found && found.role !== 'Parent') {
          // One account, one role. An address already spent on a teacher
          // cannot quietly become a parent as well.
          errors.push(`parentEmail already belongs to a ${found.role} account`);
        }

        // Names are only needed when the account does not exist yet; linking
        // to an existing parent needs nothing but the address.
        if (!found && parentEmail && EMAIL_SHAPE.test(parentEmail)) {
          if (!parentFirst) {
            errors.push('parentFirstName is required for a new parent');
          }
          if (!parentLast) {
            errors.push('parentLastName is required for a new parent');
          }
        }

        const relationship = String(row.parentrelationship || '').trim();
        let normalizedRelationship;
        if (relationship) {
          normalizedRelationship = titleCase(relationship);
          if (!RELATIONSHIPS.includes(normalizedRelationship)) {
            errors.push(
              `parentRelationship must be one of ${RELATIONSHIPS.join(', ')}`,
            );
            normalizedRelationship = undefined;
          }
        }

        parent = {
          email: parentEmail,
          firstName: parentFirst,
          lastName: parentLast,
          phone: String(row.parentphone || '').trim() || undefined,
          relationship: normalizedRelationship,
          exists: Boolean(found),
        };
      }
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
      parent,
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
 * Find the parent account for a row, creating it if this is the first time we
 * have seen the address.
 *
 * `cache` spans the whole import: two siblings naming the same parent must end
 * up under one account, and the second row would otherwise try to create an
 * address the first row just took.
 *
 * Returns `{ parent, createdNow }` — the caller needs to know whether to send
 * a welcome email, because an existing parent already has a password.
 */
const resolveParent = async (details, cache) => {
  const key = details.email;

  if (cache.has(key)) return { parent: cache.get(key), createdNow: false };

  const existing = await User.findOne({ email: key });
  if (existing) {
    cache.set(key, existing);
    return { parent: existing, createdNow: false };
  }

  const password = generatePassword();

  const parent = await User.create({
    firstName: details.firstName,
    lastName: details.lastName,
    email: key,
    password,
    phone: details.phone,
    role: 'Parent',
    parentProfile: {
      relationship: details.relationship,
      children: [],
    },
  });

  parent._generatedPassword = password;
  cache.set(key, parent);

  return { parent, createdNow: true };
};

/**
 * Link a child to a parent in both directions.
 *
 * The portal reads the relationship from both ends — the parent's dashboard
 * walks `parentProfile.children`, while a student's own record carries
 * `studentProfile.parentId` — so writing only one of them produces an account
 * that works from one side and not the other.
 */
const linkChildToParent = async (parent, student) => {
  const alreadyLinked = (parent.parentProfile?.children || []).some(
    (id) => String(id) === String(student._id),
  );

  if (!alreadyLinked) {
    if (!parent.parentProfile) parent.parentProfile = { children: [] };
    if (!Array.isArray(parent.parentProfile.children)) {
      parent.parentProfile.children = [];
    }
    parent.parentProfile.children.push(student._id);
    await parent.save();
  }

  student.studentProfile.parentId = parent._id;
  await student.save();
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
  const parentsCreated = [];
  const parentCache = new Map();

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

      const record = {
        line: entry.line,
        _id: user._id,
        firstName,
        lastName,
        email,
        password, // handed to the caller for the welcome email, never stored
        admissionNumber: user.studentProfile?.admissionNumber,
        staffId: user.teacherProfile?.staffId,
      };

      // The parent is attached after the student exists, and its failure is
      // reported without undoing the student. An enrolled child with no parent
      // linked is a gap an admin can close on the Parents page; a child who
      // failed to enrol because their father's address was malformed is not.
      if (entry.parent) {
        try {
          const { parent, createdNow } = await resolveParent(
            entry.parent,
            parentCache,
          );

          await linkChildToParent(parent, user);

          record.parentEmail = parent.email;
          record.parentLinked = true;

          if (createdNow) {
            parentsCreated.push({
              _id: parent._id,
              firstName: parent.firstName,
              lastName: parent.lastName,
              email: parent.email,
              password: parent._generatedPassword,
            });
          }
        } catch (err) {
          record.parentLinked = false;
          record.parentError = err.message;
        }
      }

      created.push(record);
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

  return { created, failed, parentsCreated };
};

/** The CSV an admin downloads to see what the importer expects. */
const buildTemplate = (role) => {
  const { required, optional } = COLUMNS[role];
  const headers = [...required, ...optional];

  const examples = {
    // Two rows on purpose: siblings naming the same parent email is how one
    // parent account ends up linked to both children, and the template is the
    // only place an admin learns that.
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
        'Chinwe',
        'Obi',
        'chinwe.obi@example.com',
        '08030000009',
        'Mother',
      ],
      [
        'Emeka',
        'Obi',
        'emeka.obi@example.com',
        '',
        'JSS 1',
        'B',
        'Male',
        '2011-09-30',
        '12 Broad Street, Lagos',
        'Chinwe',
        'Obi',
        'chinwe.obi@example.com',
        '08030000009',
        'Mother',
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
