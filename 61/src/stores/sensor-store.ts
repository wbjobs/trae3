import { create } from 'zustand';
import type { Sensor } from '../../shared/types';

interface SensorState {
  sensors: Sensor[];
  currentSensor: Sensor | null;
  loading: boolean;
  error: string | null;
  fetchSensors: () => Promise<void>;
  fetchSensor: (id: string) => Promise<void>;
  createSensor: (data: Omit<Sensor, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateSensor: (id: string, data: Partial<Sensor>) => Promise<void>;
  deleteSensor: (id: string) => Promise<void>;
}

export const useSensorStore = create<SensorState>((set) => ({
  sensors: [],
  currentSensor: null,
  loading: false,
  error: null,

  fetchSensors: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/sensors');
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      set({ sensors: result.data || [], loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchSensor: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/sensors/${id}`);
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      set({ currentSensor: result.data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createSensor: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/sensors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          id: 'sensor-' + Date.now().toString(36),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      set((s) => ({ sensors: [...s.sensors, result.data], loading: false }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  updateSensor: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/sensors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      const updated = result.data;
      set((s) => ({
        sensors: s.sensors.map((sn) => (sn.id === id ? updated : sn)),
        currentSensor: s.currentSensor?.id === id ? updated : s.currentSensor,
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  deleteSensor: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/sensors/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      set((s) => ({
        sensors: s.sensors.filter((sn) => sn.id !== id),
        currentSensor: s.currentSensor?.id === id ? null : s.currentSensor,
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
}));
