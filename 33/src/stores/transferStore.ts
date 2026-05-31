import { create } from 'zustand';
import type { Transfer, PaginatedResponse } from '@/types';
import { api } from '@/utils/api';

interface TransferQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
}

interface TransferState {
  transfers: Transfer[];
  pendingTransfers: Transfer[];
  pagination: { page: number; pageSize: number; total: number };
  loading: boolean;
  fetchTransfers: (query?: TransferQuery) => Promise<void>;
  fetchPending: () => Promise<void>;
  createTransfer: (data: Partial<Transfer>) => Promise<void>;
  approveTransfer: (id: number, approved: boolean, comment?: string) => Promise<void>;
  receiveTransfer: (id: number) => Promise<void>;
}

export const useTransferStore = create<TransferState>((set) => ({
  transfers: [],
  pendingTransfers: [],
  pagination: { page: 1, pageSize: 10, total: 0 },
  loading: false,

  fetchTransfers: async (query?: TransferQuery) => {
    set({ loading: true });
    try {
      const params = new URLSearchParams();
      if (query?.page) params.set('page', String(query.page));
      if (query?.pageSize) params.set('pageSize', String(query.pageSize));
      if (query?.status) params.set('status', query.status);
      if (query?.keyword) params.set('keyword', query.keyword);
      const res = await api.get<PaginatedResponse<Transfer>>(`/transfers?${params.toString()}`);
      set({ transfers: res.data, pagination: { page: res.page, pageSize: res.pageSize, total: res.total } });
    } finally {
      set({ loading: false });
    }
  },

  fetchPending: async () => {
    set({ loading: true });
    try {
      const res = await api.get<Transfer[]>('/transfers/pending');
      set({ pendingTransfers: res });
    } finally {
      set({ loading: false });
    }
  },

  createTransfer: async (data: Partial<Transfer>) => {
    await api.post<Transfer>('/transfers', data);
  },

  approveTransfer: async (id: number, approved: boolean, comment?: string) => {
    await api.post<Transfer>(`/transfers/${id}/approve`, { approved, comment });
  },

  receiveTransfer: async (id: number) => {
    await api.post<Transfer>(`/transfers/${id}/receive`);
  },
}));
