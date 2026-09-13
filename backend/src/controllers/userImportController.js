const AppError = require('../utils/AppError');
const { sendSuccess } = require('../utils/apiResponse');
const { emailTemplates } = require('../services/notificationService');
const { enqueueEmail } = require('../services/jobQueue');
const audit = require('../services/auditService');
const {
  IMPORTABLE_ROLES,
  COLUMNS,
  previewImport,
  createUsers,
  buildTemplate,
} = require('../services/userImportService');

const assertImportableRole = (role) => {
  if (!IMPORTABLE_ROLES.includes(role)) {
    throw AppError.badRequest(`role must be ${IMPORTABLE_ROLES.join(' or ')}.`);
  }
  return role;
};

// @desc    Validate an uploaded CSV without creating anything
// @route   POST /api/v1/users/import/preview
// @access  Admin
const previewUserImport = async (req, res) => {
  const role = assertImportableRole(req.body.role);

  if (!req.file) throw AppError.badRequest('Attach a .csv file.');

  const result = await previewImport(req.file.buffer, role);
  if (result.error) throw AppError.badRequest(result.error);

  return sendSuccess(res, 200, 'File checked', result);
};

// @desc    Create accounts from reviewed rows
// @route   POST /api/v1/users/import
// @access  Admin
const commitUserImport = async (req, res) => {
  const role = assertImportableRole(req.body.role);
  const { rows } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    throw AppError.badRequest('Send the rows to import.');
  }

  // Everything is validated again from the raw row. The preview's verdict was
  // for the admin to read, not for the server to trust — the browser could
  // send back anything, and an address free five minutes ago may be taken now.
  const { created, failed, parentsCreated } = await createUsers(rows, role);

  const welcome = (person, personRole) =>
    enqueueEmail({
      to: person.email,
      subject: 'Your account is ready',
      html: emailTemplates.welcome({
        firstName: person.firstName,
        email: person.email,
        password: person.password,
        role: personRole,
        loginUrl: `${process.env.CLIENT_URL}/login`,
      }),
    }).catch((err) =>
      console.error(`Welcome email failed for ${person.email}: ${err.message}`),
    );

  created.forEach((user) => welcome(user, role));

  // Only parents this import actually created. One that already existed keeps
  // the password it has — resending would be a password nobody asked to change.
  (parentsCreated || []).forEach((parent) => welcome(parent, 'Parent'));

  await audit.record(req, {
    action: 'user.import',
    entity: 'User',
    entityLabel: `${created.length} ${role.toLowerCase()} account(s)`,
    meta: {
      role,
      requested: rows.length,
      created: created.length,
      failed: failed.length,
      parentsCreated: (parentsCreated || []).length,
      // The addresses, so the log answers "who did this import create".
      // Passwords are never written anywhere but the email.
      emails: created.map((u) => u.email),
      parentEmails: (parentsCreated || []).map((p) => p.email),
    },
  });

  return sendSuccess(res, 201, `Created ${created.length} of ${rows.length}`, {
    created: created.map(({ password, ...safe }) => safe),
    failed,
    parentsCreated: (parentsCreated || []).map(({ password, ...safe }) => safe),
    summary: {
      requested: rows.length,
      created: created.length,
      failed: failed.length,
      parentsCreated: (parentsCreated || []).length,
      parentsLinked: created.filter((u) => u.parentLinked).length,
    },
  });
};

// @desc    Download the CSV template for a role
// @route   GET /api/v1/users/import/template?role=Student
// @access  Admin
const downloadTemplate = async (req, res) => {
  const role = assertImportableRole(req.query.role);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="schoolflo-${role.toLowerCase()}-import-template.csv"`,
  );

  // The BOM is what makes Excel open the file as UTF-8 instead of mangling
  // any name with an accent in it.
  return res.send(`\uFEFF${buildTemplate(role)}`);
};

// @desc    Which columns each role accepts, for the UI to explain
// @route   GET /api/v1/users/import/columns
// @access  Admin
const getImportColumns = async (req, res) =>
  sendSuccess(res, 200, 'Import columns', {
    roles: IMPORTABLE_ROLES,
    columns: COLUMNS,
  });

module.exports = {
  previewUserImport,
  commitUserImport,
  downloadTemplate,
  getImportColumns,
};
