import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export interface CFDParameters {
  domain: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    zMin: number;
    zMax: number;
  };
  mesh: {
    xCells: number;
    yCells: number;
    zCells: number;
    refinementLevel?: number;
  };
  phases: Array<{
    type: string;
    name: string;
    density: number;
    viscosity: number;
    volumeFraction?: number;
  }>;
  boundaryConditions: {
    inlet?: {
      velocity: { x: number; y: number; z: number };
      pressure?: number;
    };
    outlet?: {
      pressure: number;
    };
    walls?: Array<{
      name: string;
      type: string;
    }>;
  };
  simulation: {
    startTime: number;
    endTime: number;
    timeStep: number;
    writeInterval: number;
    solver: string;
    turbulenceModel: string;
  };
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  parameters: CFDParameters;
  status: string;
  priority: number;
  chunks: any[];
  totalChunks: number;
  completedChunks: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  tags?: string[];
  estimatedDuration?: number;
  actualDuration?: number;
  error?: string;
}

export interface ComputeNode {
  id: string;
  name: string;
  hostname: string;
  port: number;
  status: string;
  cpuCores: number;
  memoryGB: number;
  gpuCount?: number;
  currentLoad: number;
  memoryUsage: number;
  currentTask?: string;
  lastHeartbeat: string;
  registeredAt: string;
  capabilities: string[];
  totalTasksCompleted: number;
  totalComputeTime: number;
}

export const taskAPI = {
  create: (data: {
    name: string;
    description?: string;
    parameters: CFDParameters;
    createdBy: string;
    priority?: number;
    tags?: string[];
    numChunks?: number;
  }) => api.post<Task>('/tasks', data),

  batchCreate: (tasks: any[]) => api.post<{ tasks: Task[]; count: number }>('/tasks/batch', tasks),

  list: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    createdBy?: string;
    tags?: string;
  }) => api.get<{ tasks: Task[]; pagination: any }>('/tasks', { params }),

  get: (taskId: string) => api.get<Task>(`/tasks/${taskId}`),

  getChunks: (taskId: string) => api.get<{ chunks: any[] }>(`/tasks/${taskId}/chunks`),

  getResults: (taskId: string) => api.get<{ results: any[] }>(`/tasks/${taskId}/results`),

  cancel: (taskId: string) => api.post(`/tasks/${taskId}/cancel`),

  downloadResults: (taskId: string) =>
    api.get(`/tasks/${taskId}/results/download`, {
      responseType: 'blob',
    }),

  exportCSV: (taskId: string) =>
    api.get(`/tasks/${taskId}/results/export/csv`, {
      responseType: 'blob',
    }),
};

export const nodeAPI = {
  list: () => api.get<{ nodes: ComputeNode[] }>('/nodes'),
  getAvailable: () => api.get<{ nodes: ComputeNode[] }>('/nodes/available'),
  get: (nodeId: string) => api.get<ComputeNode>(`/nodes/${nodeId}`),
  remove: (nodeId: string) => api.delete(`/nodes/${nodeId}`),
  getCount: () => api.get<{ connectedNodes: number }>('/nodes/stats/count'),
};

export const statsAPI = {
  get: () =>
    api.get<{
      pendingTasks: number;
      runningTasks: number;
      completedTasks: number;
      failedTasks: number;
      onlineNodes: number;
      busyNodes: number;
      storage: {
        totalSize: number;
        resultCount: number;
        taskCount: number;
      };
    }>('/stats'),
};

export const healthAPI = {
  check: () =>
    api.get<{
      status: string;
      timestamp: string;
      uptime: number;
    }>('/health'),
};

export default api;
