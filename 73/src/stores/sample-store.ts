import { create } from 'zustand';

interface SampleStore {
  currentSample: any | null;
  sampleList: any[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  setCurrentSample: (sample: any | null) => void;
  setSampleList: (items: any[], total: number, page: number, pageSize: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSampleStore = create<SampleStore>((set) => ({
  currentSample: null,
  sampleList: [],
  total: 0,
  page: 1,
  pageSize: 10,
  loading: false,
  error: null,
  setCurrentSample: (sample) => set({ currentSample: sample }),
  setSampleList: (items, total, page, pageSize) => set({ sampleList: items, total, page, pageSize }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
