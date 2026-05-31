import { create } from 'zustand';
import type { DashboardOverview, DeviceInfo, AlertInfo, DataFilter, PaginatedResponse } from '../types';
import { dataApi, deviceApi, alertApi } from '../services/api';

interface DashboardState {
  overview: DashboardOverview | null;
  devices: PaginatedResponse<DeviceInfo> | null;
  alerts: PaginatedResponse<AlertInfo> | null;
  loading: boolean;
  error: string | null;
  
  fetchOverview: () => Promise<void>;
  fetchDevices: (filter?: DataFilter) => Promise<void>;
  fetchAlerts: (filter?: DataFilter) => Promise<void>;
  handleAlert: (id: string, status: string) => Promise<void>;
  initMockData: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  overview: null,
  devices: null,
  alerts: null,
  loading: false,
  error: null,

  fetchOverview: async () => {
    set({ loading: true, error: null });
    try {
      const response = await dataApi.getDashboardOverview();
      set({ overview: response.data });
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },

  fetchDevices: async (filter?: DataFilter) => {
    set({ loading: true, error: null });
    try {
      const response = await deviceApi.getDevices(filter || {});
      set({ devices: response.data });
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },

  fetchAlerts: async (filter?: DataFilter) => {
    set({ loading: true, error: null });
    try {
      const response = await alertApi.getAlerts(filter || {});
      set({ alerts: response.data });
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },

  handleAlert: async (id: string, status: string) => {
    try {
      await alertApi.handleAlert(id, status);
      await get().fetchAlerts();
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  initMockData: async () => {
    try {
      await deviceApi.initializeMockData();
      await get().fetchOverview();
      await get().fetchDevices();
      await get().fetchAlerts();
    } catch (error: any) {
      set({ error: error.message });
    }
  }
}));
