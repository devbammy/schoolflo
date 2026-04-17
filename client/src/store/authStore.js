import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await api.post('/auth/login', { email, password });
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

      logout: () => {
        delete api.defaults.headers.common['Authorization'];
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;
        try {
          const { data } = await api.post('/auth/refresh', { refreshToken });
          const { accessToken } = data.data;
          set({ accessToken });
          api.defaults.headers.common['Authorization'] =
            `Bearer ${accessToken}`;
          return true;
        } catch {
          get().logout();
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

export default useAuthStore;
