import { create } from 'zustand';
import api from '../services/api';

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
 */
const useFeatureStore = create((set) => ({
  features: {
    onlinePayments: true,
    staffAttendance: true,
  },
  loaded: false,

  load: async () => {
    try {
      const { data } = await api.get('/config');
      set({ features: data.data.features, loaded: true });
    } catch {
      // Keep the permissive defaults and let the server be the authority.
      set({ loaded: true });
    }
  },
}));

/** Read one feature. Unknown names read as enabled, never as hidden. */
export const useFeature = (name) =>
  useFeatureStore((s) => s.features[name] !== false);

export default useFeatureStore;
