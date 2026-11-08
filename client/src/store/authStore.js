import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { registerAuthBridge } from '../services/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // `identifier` is an email, or a student's admission number.
      login: async (identifier, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.post('/auth/login', {
            identifier,
            password,
          });
          const { user, accessToken, refreshToken } = data.data;

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });

          api.defaults.headers.common['Authorization'] =
            `Bearer ${accessToken}`;

          return { success: true, role: user.role };
        } catch (err) {
          const msg = err.response?.data?.message || 'Login failed';
          set({ error: msg, isLoading: false });
          return { success: false, error: msg };
        } finally {
          set({ isLoading: false });
        }
      },

      // Wipe local auth state only. Used directly when the session is already
      // known to be dead server-side, so we don't call the API with a token
      // that just failed.
      clearSession: () => {
        delete api.defaults.headers.common['Authorization'];
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });
      },

      logout: async () => {
        const { refreshToken } = get();

        // Tell the server to revoke this device's session. Clearing local
        // state alone used to leave the refresh token valid for its full
        // lifetime, so "logging out" revoked nothing.
        if (refreshToken) {
          try {
            await api.post('/auth/logout', { refreshToken });
          } catch {
            // Network failure or an already-dead session: sign out locally
            // regardless, so the user is never stuck logged in.
          }
        }

        get().clearSession();
      },

      // Sign out everywhere — useful after a password change or a lost device.
      logoutEverywhere: async () => {
        try {
          await api.post('/auth/logout-all');
        } catch {
          // fall through to local sign-out
        }

        get().clearSession();
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;
        try {
          const { data } = await api.post('/auth/refresh', { refreshToken });
          const { accessToken, refreshToken: rotated } = data.data;
          // The server rotates the refresh token on every use. Persist the
          // replacement, or the next refresh presents a retired token and the
          // session is revoked as a suspected replay.
          set(
            rotated ? { accessToken, refreshToken: rotated } : { accessToken },
          );
          api.defaults.headers.common['Authorization'] =
            `Bearer ${accessToken}`;
          return true;
        } catch {
          get().clearSession();
          return false;
        }
      },

      updateUser: (updates) =>
        set((state) => ({ user: { ...state.user, ...updates } })),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'smp-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

// Hand the axios interceptors a live view of auth state. Doing it here keeps
// the import pointing store -> api, so there is no circular dependency.
registerAuthBridge({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  setAccessToken: (accessToken) => useAuthStore.setState({ accessToken }),
  setRefreshToken: (refreshToken) => useAuthStore.setState({ refreshToken }),
  onSessionExpired: () => useAuthStore.getState().clearSession(),
});

export default useAuthStore;
