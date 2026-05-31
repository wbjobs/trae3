import { create } from 'zustand';
import type { Task, Node, NodeMetrics, CalculationResult, DashboardStats, Alert } from '../../shared/types.js';

interface AppState {
  tasks: Task[];
  nodes: Node[];
  selectedTask: Task | null;
  selectedNode: Node | null;
  results: CalculationResult[];
  selectedResult: CalculationResult | null;
  dashboardStats: DashboardStats | null;
  nodeMetrics: Record<string, NodeMetrics[]>;
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  connected: boolean;
}

interface AppActions {
  setTasks: (tasks: Task[]) => void;
  setNodes: (nodes: Node[]) => void;
  setSelectedTask: (task: Task | null) => void;
  setSelectedNode: (node: Node | null) => void;
  setResults: (results: CalculationResult[]) => void;
  setSelectedResult: (result: CalculationResult | null) => void;
  setDashboardStats: (stats: DashboardStats) => void;
  setNodeMetrics: (nodeId: string, metrics: NodeMetrics[]) => void;
  addNodeMetrics: (nodeId: string, metrics: NodeMetrics) => void;
  setAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  updateTask: (task: Task) => void;
  updateNode: (node: Node) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setConnected: (connected: boolean) => void;
}

const initialState: AppState = {
  tasks: [],
  nodes: [],
  selectedTask: null,
  selectedNode: null,
  results: [],
  selectedResult: null,
  dashboardStats: null,
  nodeMetrics: {},
  alerts: [],
  loading: false,
  error: null,
  connected: false,
};

export const useAppStore = create<AppState & AppActions>((set) => ({
  ...initialState,

  setTasks: (tasks) => set({ tasks }),
  setNodes: (nodes) => set({ nodes }),
  setSelectedTask: (task) => set({ selectedTask: task }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setResults: (results) => set({ results }),
  setSelectedResult: (result) => set({ selectedResult: result }),
  setDashboardStats: (stats) => set({ dashboardStats: stats }),
  setNodeMetrics: (nodeId, metrics) =>
    set((state) => ({
      nodeMetrics: { ...state.nodeMetrics, [nodeId]: metrics },
    })),
  addNodeMetrics: (nodeId, metrics) =>
    set((state) => {
      const existing = state.nodeMetrics[nodeId] || [];
      const updated = [...existing, metrics].slice(-100);
      return {
        nodeMetrics: { ...state.nodeMetrics, [nodeId]: updated },
      };
    }),
  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 50),
    })),
  updateTask: (task) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    })),
  updateNode: (node) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === node.id ? node : n)),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setConnected: (connected) => set({ connected }),
}));
