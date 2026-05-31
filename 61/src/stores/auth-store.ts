import { create } from 'zustand';
import type { Role, Permission } from '../../shared/types';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'sensor:read', 'sensor:write',
    'panel:read', 'panel:write',
    'data:read', 'data:export',
    'metadata:read', 'metadata:write',
    'system:admin',
  ],
  engineer: [
    'sensor:read', 'sensor:write',
    'panel:read', 'panel:write',
    'data:read',
    'metadata:read',
  ],
  analyst: [
    'sensor:read',
    'panel:read',
    'data:read', 'data:export',
    'metadata:read',
  ],
};

interface AuthState {
  user: { id: string; username: string; role: Role } | null;
  permissions: Set<Permission>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  hasPermission: (perm: Permission) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: new Set(),

  login: async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem('token', data.token);
      const perms = ROLE_PERMISSIONS[data.user.role] || [];
      set({ user: data.user, permissions: new Set(perms) });
      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, permissions: new Set() });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ user: null, permissions: new Set() });
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        localStorage.removeItem('token');
        set({ user: null, permissions: new Set() });
        return;
      }
      const data = await res.json();
      const perms = ROLE_PERMISSIONS[data.role] || [];
      set({ user: { id: data.id, username: data.username, role: data.role }, permissions: new Set(perms) });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, permissions: new Set() });
    }
  },

  hasPermission: (perm: Permission) => {
    return get().permissions.has(perm);
  },
}));
