import { create } from 'zustand';
import { api } from '@/utils/api';

interface Alert {
  id: number;
  type: 'transfer_timeout' | 'lab_capacity' | 'status_anomaly';
  title: string;
  content: string;
  read: boolean;
  createdAt: string;
  relatedId?: number;
}

interface AlertStore {
  alerts: Alert[];
  unreadAlertCount: number;
  fetchAlerts: () => Promise<void>;
}

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  unreadAlertCount: 0,

  fetchAlerts: async () => {
    try {
      const res = await api.get<Alert[]>('/alerts');
      set({
        alerts: res || [],
        unreadAlertCount: (res || []).filter((a: Alert) => !a.read).length,
      });
    } catch {
      set({ alerts: [], unreadAlertCount: 0 });
    }
  },
}));
