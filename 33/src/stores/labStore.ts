import { create } from 'zustand';
import type { Lab } from '@/types';
import { api } from '@/utils/api';

interface LabState {
  labs: Lab[];
  loading: boolean;
  fetchLabs: () => Promise<void>;
}

export const useLabStore = create<LabState>((set) => ({
  labs: [],
  loading: false,

  fetchLabs: async () => {
    set({ loading: true });
    try {
      const res = await api.get<Lab[]>('/labs');
      set({ labs: res });
    } finally {
      set({ loading: false });
    }
  },
}));
