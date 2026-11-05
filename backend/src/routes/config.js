const express = require('express');
const router = express.Router();
const { getFeatures } = require('../config/features');
const { sendSuccess } = require('../utils/apiResponse');

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
router.get('/', (req, res) =>
  sendSuccess(res, 200, 'Configuration fetched', {
    features: getFeatures(),
    // The same SCHOOL_NAME printed on its report cards. Public, like the rest of
    // this: the login page shows it before anyone has signed in.
    school: { name: (process.env.SCHOOL_NAME || '').trim() || null },
  }),
);

module.exports = router;
