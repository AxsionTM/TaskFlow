import { create } from 'zustand';
import { api, ApiError } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl?: string | null;
  theme?: string;
  locale?: string;
  birthday?: string | null;
  emailVerified?: boolean;
  role?: string;
  plan?: string;
  balance?: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** email ожидает подтверждения после register/login */
  pendingVerificationEmail: string | null;
  /** Maintenance mode: показывается полноэкранное уведомление */
  maintenance: { message: string } | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<{ email: string; devCode?: string }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendCode: (email: string, purpose?: 'verify' | 'reset') => Promise<{ message: string; devCode?: string }>;
  forgotPassword: (email: string) => Promise<{ message: string; devCode?: string }>;
  verifyResetCode: (email: string, code: string) => Promise<string>;
  resetPassword: (resetToken: string, password: string) => Promise<void>;
  clearPendingVerification: () => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  pendingVerificationEmail: null,
  maintenance: null,

  login: async (email, password) => {
    try {
      const { user, token } = await api.login({ email, password });
      api.setToken(token);
      set({ user, token, isAuthenticated: true, isLoading: false, pendingVerificationEmail: null, maintenance: null });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MAINTENANCE') {
        try {
          const s = await api.systemStatus();
          set({ maintenance: { message: s.maintenance.message } });
        } catch {
          set({ maintenance: { message: err.message } });
        }
      }
      // Почта не подтверждена → ведём на страницу ввода кода, сессию не создаём.
      if (
        err instanceof ApiError &&
        (err.status === 403 || (err as any)?.code === 'EMAIL_NOT_VERIFIED')
      ) {
        set({ pendingVerificationEmail: email.trim().toLowerCase() });
      }
      throw err;
    }
  },

  register: async (email, password, name) => {
    const res = await api.register({ email, password, confirmPassword: password, name });
    // Токен до подтверждения не выдаётся — только pending email.
    set({ pendingVerificationEmail: res.email });
    return { email: res.email, devCode: res.devCode };
  },

  verifyEmail: async (email, code) => {
    const { user, token } = await api.verifyEmail({ email, code });
    api.setToken(token);
    set({ user, token, isAuthenticated: true, isLoading: false, pendingVerificationEmail: null });
  },

  resendCode: async (email, purpose) => {
    const res = await api.resendCode({ email, purpose });
    return { message: res.message, devCode: res.devCode };
  },

  forgotPassword: async (email) => {
    const res = await api.forgotPassword({ email });
    return { message: res.message, devCode: res.devCode };
  },

  verifyResetCode: async (email, code) => {
    const res = await api.verifyResetCode({ email, code });
    return res.resetToken;
  },

  resetPassword: async (resetToken, password) => {
    const res = await api.resetPassword({ resetToken, password, confirmPassword: password });
    api.setToken(res.token);
    set({ user: res.user, token: res.token, isAuthenticated: true, isLoading: false });
  },

  clearPendingVerification: () => set({ pendingVerificationEmail: null }),

  logout: () => {
    api.setToken(null);
    set({ user: null, token: null, isAuthenticated: false, pendingVerificationEmail: null });
  },

  setUser: (user) => set({ user }),

  checkAuth: async () => {
    const token = api.getToken();
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const { user } = await api.me();
      set({ user, token, isAuthenticated: true, isLoading: false, maintenance: null });
    } catch (err) {
      // Maintenance: показываем экран обслуживания вместо приложения.
      if (err instanceof ApiError && err.code === 'MAINTENANCE') {
        try {
          const s = await api.systemStatus();
          set({ maintenance: { message: s.maintenance.message }, isLoading: false });
        } catch {
          set({ maintenance: { message: (err as Error).message }, isLoading: false });
        }
        return;
      }
      // A refresh must not log the user out just because the API is
      // temporarily restarting or the network is unavailable.
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
        api.setToken(null);
        set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      } else {
        set((state) => ({
          token,
          isAuthenticated: true,
          isLoading: false,
          user: state.user,
        }));
      }
    }
  },
}));
