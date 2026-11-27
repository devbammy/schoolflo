const express = require('express');
const router = express.Router();
const { getFeatures } = require('../config/features');
const { GRADE_SCALES } = require('../config/constants');
const { sendSuccess } = require('../utils/apiResponse');
const SchoolSettings = require('../models/SchoolSettings');
const {
  serveLogo,
  describe,
} = require('../controllers/schoolSettingsController');

/**
 * What this deployment runs, for the client to shape itself around.
 *
 * Public, and deliberately so. The feature set is not a secret — it is
 * already observable from which routes answer — and the login page renders
 * before there is a token to authenticate with. Making the client fetch it
 * rather than carry its own `VITE_FEATURES` copy is the same rule the grading
 * scale follows: two copies of one truth in two deployables will drift, and
 * the one that drifts is the one nobody notices.
 *
 * Hiding a nav item is cosmetic. The server-side guard is the actual control.
 */
router.get('/', async (req, res) => {
  // The school's address, contacts and logo, for the header of its printed
  // documents. Public, as the printed card is; the head's signature is not
  // here (see SchoolSettings).
  const details = describe(await SchoolSettings.current());
  return sendSuccess(res, 200, 'Configuration fetched', {
    features: getFeatures(),
    // The same SCHOOL_NAME printed on its report cards. Public, like the rest of
    // this: the login page shows it before anyone has signed in.
    school: {
      name: (process.env.SCHOOL_NAME || '').trim() || null,
      // The School Details page, or the SCHOOL_* settings the letters used
      // before it existed, so nothing configured earlier is lost.
      address:
        details.address || (process.env.SCHOOL_ADDRESS || '').trim() || null,
      email: details.email || (process.env.SCHOOL_EMAIL || '').trim() || null,
      phones: details.phones || (process.env.SCHOOL_PHONE || '').trim() || null,
      // A path under the API, versioned so a new logo is a new URL.
      logoPath: details.logoVersion
        ? `/config/logo?v=${details.logoVersion}`
        : null,
    },
    // The one grading ladder, for the score-entry pages to preview grades as a
    // teacher types. They used to carry their own copies.
    // Both scales: a score-entry page picks the one for its class's level
    // (primary for 'Primary' classes, college for the rest).
    gradeScales: GRADE_SCALES,
  });
});

// The school's logo, public: it heads every printed card.
router.get('/logo', serveLogo);

module.exports = router;
