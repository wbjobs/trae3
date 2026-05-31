import { create } from 'zustand';
import type { DashboardStats } from '../../shared/types';
import * as api from '@/utils/api';

interface DashboardState {
  stats: DashboardStats | null;
  isLoading: boolean;
  fetchStats: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: null,
  isLoading: false,

  fetchStats: async () => {
    set({ isLoading: true });
    try {
      const stats = await api.getDashboardStats();
      set({ stats, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
