/**
 * Which features this deployment runs.
 *
 * SchoolFlo is one codebase deployed once per school. Schools do not all want
 * the same portal — one takes fees at the office and has no use for a payment
 * gateway, another does not clock its staff in and out — but they all want the
 * same security fixes. So a school is a *configuration*, never a branch: a
 * branch whose customisation is deleted code turns every upstream change into
 * a merge conflict, and the schools on old branches are the ones that quietly
 * stop getting patched.
 *
 * Everything is on by default. A deployment that sets nothing behaves exactly
 * as the full product does, which is what keeps this cheap to add to.
 *
 * Resolution order, last wins:
 *   1. every feature on
 *   2. the named profile in SCHOOL_PROFILE
 *   3. a per-feature override, FEATURE_<UPPER_SNAKE>=true|false
 *
 * Adding a feature is one key here, one guard on the route, and one `feature`
 * tag on the client's nav entry.
 */

// Every switchable feature, and what turning it off actually removes.
const FEATURES = {
  // Card payment through Paystack and Flutterwave, and the gateway webhook.
  // Off does NOT mean "no fees": fee structures, manual/offline payments,
  // balances, receipts and the financial report are core and always present.
  // A school that collects at the office still needs every one of them.
  onlinePayments: true,

  // The whole staff attendance domain: the teacher's clock, the admin's daily
  // roster, per-staff summaries and the records behind them.
  staffAttendance: true,

  // Results held back from a family until fees are paid: a term's result is
  // locked while that term's fee, or any earlier one, has a balance. See
  // services/resultAccessService.js.
  //
  // The one feature that defaults OFF, and on purpose. The others add
  // something, so "on" is the safe default; this one withholds something, and
  // defaulting it on would have locked every existing school's report cards
  // the day they upgraded. A school opts in: FEATURE_RESULTS_REQUIRE_FEES=true.
  resultsRequireFees: false,
};

// Named profiles. A profile is a delta on top of "everything on", so a new
// feature is automatically available to every school until someone decides
// otherwise — the safe direction for a default to fail in.
const PROFILES = {
  full: {},

  // Fees collected at the school office; no gateway, no staff clock.
  'office-fees': {
    onlinePayments: false,
    staffAttendance: false,
  },
};

const parseBoolean = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

const envKey = (feature) =>
  `FEATURE_${feature.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`;

/**
 * Resolve the feature set. Reads the environment on each call rather than at
 * require time so tests can set a profile without re-importing the module.
 */
const resolveFeatures = (env = process.env) => {
  const profileName = (env.SCHOOL_PROFILE || 'full').trim();
  const profile = PROFILES[profileName];

  if (!profile) {
    // A typo in SCHOOL_PROFILE must not silently ship the full product to a
    // school that asked for less. Fail at boot, where someone is watching.
    throw new Error(
      `Unknown SCHOOL_PROFILE '${profileName}'. Known profiles: ${Object.keys(
        PROFILES,
      ).join(', ')}.`,
    );
  }

  const resolved = {};

  Object.keys(FEATURES).forEach((feature) => {
    const override = parseBoolean(env[envKey(feature)]);
    resolved[feature] = override ?? profile[feature] ?? FEATURES[feature];
  });

  return resolved;
};

let cached = null;

/** The resolved feature set for this process. */
const getFeatures = () => {
  if (!cached) cached = resolveFeatures();
  return cached;
};

const isEnabled = (feature) => {
  const features = getFeatures();

  if (!(feature in features)) {
    // A guard naming a feature that does not exist would otherwise be a
    // silent no-op, which is the worst way for an access control to fail.
    throw new Error(`Unknown feature '${feature}'.`);
  }

  return features[feature];
};

/** Test seam — forget the resolved set so the next read re-reads the env. */
const resetFeatures = () => {
  cached = null;
};

module.exports = {
  FEATURES,
  PROFILES,
  resolveFeatures,
  getFeatures,
  isEnabled,
  resetFeatures,
  envKey,
};
