import { create } from 'zustand';
import type { User } from '@/types';
import { api } from '@/utils/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => void;
}

const getStoredAuth = () => {
  try {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      const user = JSON.parse(userStr) as User;
      return { user, token, isAuthenticated: true };
    }
  } catch {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
  return { user: null, token: null, isAuthenticated: false };
};

export const useAuthStore = create<AuthState>((set) => {
  const initial = getStoredAuth();
  return {
    user: initial.user,
    token: initial.token,
    isAuthenticated: initial.isAuthenticated,
    isLoading: false,

    login: async (username: string, password: string) => {
      set({ isLoading: true });
      try {
        const res = await api.post<{ token: string; user: User }>('/auth/login', { username, password });
        localStorage.setItem('token', res.token);
        localStorage.setItem('user', JSON.stringify(res.user));
        set({ token: res.token, user: res.user, isAuthenticated: true, isLoading: false });
      } finally {
        set({ isLoading: false });
      }
    },

    logout: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      set({ token: null, user: null, isAuthenticated: false });
      window.location.href = '/login';
    },

    loadFromStorage: () => {
      const stored = getStoredAuth();
      if (stored.isAuthenticated) {
        set(stored);
      }
    },
  };
});
