/**
 * Check the environment once, at boot.
 *
 * Without this a missing JWT_SECRET did not stop the server: it started, served
 * the login page's requests, and then threw inside jsonwebtoken on the first
 * sign-in. A missing Paystack key surfaced as a 500 on a parent's payment, and
 * an unset SMTP host as emails that quietly never arrived. All of those are
 * knowable before the first request, so say so then, in the log, where whoever
 * is deploying is watching.
 *
 * Three tiers:
 *   fatal      the app cannot work, or would work insecurely. Refuse to start.
 *   production fatal only in production, so a developer is not blocked locally.
 *   warning    a feature will not work, but the rest of the portal will.
 */
const { getFeatures } = require('./features');

const MIN_SECRET_LENGTH = 32;

const isSet = (env, key) => Boolean(String(env[key] || '').trim());

/**
 * @param {object} env  process.env, injectable for tests
 * @returns {{ errors: string[], warnings: string[] }}
 */
const checkEnv = (env = process.env) => {
  const production = env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  // ── Fatal everywhere ───────────────────────────────────────────────────
  ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'].forEach((key) => {
    if (!isSet(env, key)) errors.push(`${key} is not set.`);
  });

  // ── Fatal in production, a warning elsewhere ──────────────────────────
  const strict = production ? errors : warnings;

  ['JWT_SECRET', 'JWT_REFRESH_SECRET'].forEach((key) => {
    if (isSet(env, key) && env[key].length < MIN_SECRET_LENGTH) {
      strict.push(
        `${key} is shorter than ${MIN_SECRET_LENGTH} characters. ` +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
      );
    }
  });

  if (isSet(env, 'JWT_SECRET') && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    // One leaked secret would then mint both kinds of token.
    strict.push('JWT_SECRET and JWT_REFRESH_SECRET must be different values.');
  }

  if (!isSet(env, 'CLIENT_URL')) {
    strict.push(
      'CLIENT_URL is not set. Links in emails, payment redirects and CORS ' +
        'depend on it.',
    );
  }

  // ── Warnings: a feature degrades, the portal runs ─────────────────────
  if (isSet(env, 'RESEND_API_KEY')) {
    // Sent over HTTPS (see notificationService); the SMTP settings are unused.
    ['FROM_EMAIL', 'FROM_NAME'].forEach((key) => {
      if (!isSet(env, key)) warnings.push(`${key} is not set (email).`);
    });
  } else if (!isSet(env, 'SMTP_HOST')) {
    warnings.push(
      'Neither RESEND_API_KEY nor SMTP_HOST is set: no email (welcome, reset, receipts) will be sent.',
    );
  } else {
    ['SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL'].forEach((key) => {
      if (!isSet(env, key)) warnings.push(`${key} is not set (email).`);
    });
  }

  [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ].forEach((key) => {
    if (!isSet(env, key)) {
      warnings.push(`${key} is not set: file uploads will fail.`);
    }
  });

  if (!isSet(env, 'SCHOOL_NAME')) {
    warnings.push(
      'SCHOOL_NAME is not set: report cards, certificates and letters cannot be generated.',
    );
  }

  if (getFeatures().onlinePayments) {
    if (!isSet(env, 'PAYSTACK_SECRET_KEY')) {
      warnings.push(
        'PAYSTACK_SECRET_KEY is not set: card payments and the Paystack webhook will fail.',
      );
    }
    if (
      isSet(env, 'FLUTTERWAVE_SECRET_KEY') &&
      !isSet(env, 'FLUTTERWAVE_WEBHOOK_HASH')
    ) {
      warnings.push(
        'FLUTTERWAVE_WEBHOOK_HASH is not set: Flutterwave payments cannot be confirmed by webhook.',
      );
    }
  }

  return { errors, warnings };
};

/** Log the result, and stop the process if anything fatal is wrong. */
const validateEnv = (env = process.env) => {
  const { errors, warnings } = checkEnv(env);

  warnings.forEach((message) => console.warn(`⚠️  ${message}`));

  if (errors.length) {
    errors.forEach((message) => console.error(`❌ ${message}`));
    console.error(
      '❌ Refusing to start with an unsafe or incomplete configuration. See backend/.env.example.',
    );
    process.exit(1);
  }
};

module.exports = { checkEnv, validateEnv, MIN_SECRET_LENGTH };
