import { create } from 'zustand';
import type { ScadaPanel } from '../../shared/types';

interface PanelState {
  panels: ScadaPanel[];
  currentPanel: ScadaPanel | null;
  loading: boolean;
  error: string | null;
  fetchPanels: () => Promise<void>;
  fetchPanel: (id: string) => Promise<void>;
  createPanel: (data: Omit<ScadaPanel, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updatePanel: (id: string, data: Partial<ScadaPanel>) => Promise<void>;
  deletePanel: (id: string) => Promise<void>;
}

export const usePanelStore = create<PanelState>((set) => ({
  panels: [],
  currentPanel: null,
  loading: false,
  error: null,

  fetchPanels: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/panels');
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      set({ panels: result.data || [], loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchPanel: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/panels/${id}`);
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      set({ currentPanel: result.data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createPanel: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/panels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          id: 'panel-' + Date.now().toString(36),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      set((s) => ({ panels: [...s.panels, result.data], loading: false }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  updatePanel: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/panels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      const updated = result.data;
      set((s) => ({
        panels: s.panels.map((p) => (p.id === id ? updated : p)),
        currentPanel: s.currentPanel?.id === id ? updated : s.currentPanel,
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  deletePanel: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/panels/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      set((s) => ({
        panels: s.panels.filter((p) => p.id !== id),
        currentPanel: s.currentPanel?.id === id ? null : s.currentPanel,
        loading: false,
      }));
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
}));
