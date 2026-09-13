import { create } from 'zustand';
import api, { registerFeatureBridge } from '../services/api';

/**
 * Which features this deployment runs, fetched from the server.
 *
 * Deliberately not a `VITE_FEATURES` build-time constant. The backend already
 * decides this — it is the side that actually refuses a disabled route — and
 * a second copy of that decision baked into the client bundle would drift the
 * first time someone changes one and not the other. Same rule the grading
 * scale follows: one source, served.
 *
 * Everything defaults to on. A school whose config endpoint is unreachable
 * sees the full navigation and gets a 404 from the server if they click into
 * something disabled, which is a worse experience than hiding it but a much
 * better one than an empty sidebar.
 *
 * The set is refreshed rather than fetched once. It used to load only at app
 * mount, so a tab left open across a config change kept asking for routes the
 * server had stopped mounting — the teacher got a run of "Route
 * /api/v1/staff-attendance/today not found" toasts and no way to guess that a
 * reload would fix it.
 */

// Two guards against a stampede: one in-flight request at a time, and a floor
// on how often an unforced refresh may run. A page that fires three requests
// at a dead feature must not cause three config fetches.
let inFlight = null;
let lastFetchedAt = 0;
const MIN_REFRESH_GAP_MS = 5000;

const fetchFeatures = (set, { force }) => {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastFetchedAt < MIN_REFRESH_GAP_MS) {
    return Promise.resolve();
  }

  lastFetchedAt = Date.now();

  inFlight = api
    .get('/config')
    .then(({ data }) => {
      set({ features: data.data.features, loaded: true });
    })
    .catch(() => {
      // Keep whatever we already had and let the server be the authority.
      set({ loaded: true });
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

const useFeatureStore = create((set) => ({
  features: {
    onlinePayments: true,
    staffAttendance: true,
  },
  loaded: false,

  /** First read, at app mount. Gates the initial render. */
  load: () => fetchFeatures(set, { force: true }),

  /** Re-read, when something suggests the set has moved on. Rate limited. */
  refresh: () => fetchFeatures(set, { force: false }),
}));

/**
 * The api layer cannot import this store — the store imports api, and the
 * cycle risks a temporal-dead-zone error at module init — so it calls back in
 * through a bridge, exactly as the auth layer already does.
 *
 * A 404 for a route the client still believes in is the definition of a stale
 * feature set, so it is worth re-reading on the spot.
 */
registerFeatureBridge({
  onStaleFeature: () => useFeatureStore.getState().refresh(),
});

/** Read one feature. Unknown names read as enabled, never as hidden. */
export const useFeature = (name) =>
  useFeatureStore((s) => s.features[name] !== false);

export default useFeatureStore;
