import { create } from 'zustand';
import type { Sample, PaginatedResponse, SampleStatus } from '@/types';
import { api } from '@/utils/api';

interface SampleQuery {
  page?: number;
  pageSize?: number;
  type?: string;
  status?: string;
  keyword?: string;
  labId?: number;
}

interface SampleState {
  samples: Sample[];
  currentSample: Sample | null;
  pagination: { page: number; pageSize: number; total: number };
  loading: boolean;
  fetchSamples: (query?: SampleQuery) => Promise<void>;
  fetchSample: (id: number) => Promise<void>;
  createSample: (data: Partial<Sample>) => Promise<void>;
  updateSampleStatus: (id: number, status: SampleStatus) => Promise<void>;
}

export const useSampleStore = create<SampleState>((set) => ({
  samples: [],
  currentSample: null,
  pagination: { page: 1, pageSize: 10, total: 0 },
  loading: false,

  fetchSamples: async (query?: SampleQuery) => {
    set({ loading: true });
    try {
      const params = new URLSearchParams();
      if (query?.page) params.set('page', String(query.page));
      if (query?.pageSize) params.set('pageSize', String(query.pageSize));
      if (query?.type) params.set('type', query.type);
      if (query?.status) params.set('status', query.status);
      if (query?.keyword) params.set('keyword', query.keyword);
      if (query?.labId) params.set('labId', String(query.labId));
      const res = await api.get<PaginatedResponse<Sample>>(`/samples?${params.toString()}`);
      set({ samples: res.data, pagination: { page: res.page, pageSize: res.pageSize, total: res.total } });
    } finally {
      set({ loading: false });
    }
  },

  fetchSample: async (id: number) => {
    set({ loading: true });
    try {
      const res = await api.get<Sample>(`/samples/${id}`);
      set({ currentSample: res });
    } finally {
      set({ loading: false });
    }
  },

  createSample: async (data: Partial<Sample>) => {
    await api.post<Sample>('/samples', data);
  },

  updateSampleStatus: async (id: number, status: SampleStatus) => {
    await api.patch<Sample>(`/samples/${id}/status`, { status });
  },
}));
