import { create } from 'zustand';
import type { StatisticsOverview, TransferTrend, LabLoad, ApprovalEfficiency } from '@/types';
import { api } from '@/utils/api';

interface StatisticsState {
  overview: StatisticsOverview | null;
  trend: TransferTrend[];
  labLoad: LabLoad[];
  efficiency: ApprovalEfficiency | null;
  loading: boolean;
  fetchOverview: () => Promise<void>;
  fetchTrend: (days?: number) => Promise<void>;
  fetchLabLoad: () => Promise<void>;
  fetchApprovalEfficiency: () => Promise<void>;
}

export const useStatisticsStore = create<StatisticsState>((set) => ({
  overview: null,
  trend: [],
  labLoad: [],
  efficiency: null,
  loading: false,

  fetchOverview: async () => {
    set({ loading: true });
    try {
      const res = await api.get<StatisticsOverview>('/statistics/overview');
      set({ overview: res });
    } finally {
      set({ loading: false });
    }
  },

  fetchTrend: async (days?: number) => {
    const query = days ? `?days=${days}` : '';
    const res = await api.get<TransferTrend[]>(`/statistics/trend${query}`);
    set({ trend: res });
  },

  fetchLabLoad: async () => {
    const res = await api.get<LabLoad[]>('/statistics/lab-load');
    set({ labLoad: res });
  },

  fetchApprovalEfficiency: async () => {
    const res = await api.get<ApprovalEfficiency>('/statistics/approval-efficiency');
    set({ efficiency: res });
  },
}));
