const API_BASE = '/api/v1';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(API_BASE + url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const data = await response.json();
    return data as ApiResponse<T>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export const api = {
  getDashboardStats: () => request('/dashboard/stats'),
  getAlerts: (params?: { page?: number; pageSize?: number; resolved?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    if (params?.resolved !== undefined) query.append('resolved', params.resolved.toString());
    return request('/dashboard/alerts?' + query.toString());
  },
  getTaskTrend: (days?: number) =>
    request('/dashboard/task-trend' + (days ? '?days=' + days : '')),
  getResourceUsage: () => request('/dashboard/resource-usage'),

  getTasks: (params?: { page?: number; pageSize?: number; status?: string; userId?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    if (params?.status) query.append('status', params.status);
    if (params?.userId) query.append('userId', params.userId);
    return request('/tasks?' + query.toString());
  },
  createTask: (data: unknown) =>
    request('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getTaskById: (id: string) => request('/tasks/' + id),
  cancelTask: (id: string) =>
    request('/tasks/' + id + '/cancel', { method: 'PUT' }),
  getTaskShards: (id: string) => request('/tasks/' + id + '/shards'),
  getTaskLogs: (id: string) => request('/tasks/' + id + '/logs'),

  getNodes: (params?: { page?: number; pageSize?: number; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    if (params?.status) query.append('status', params.status);
    return request('/nodes?' + query.toString());
  },
  getNodeById: (id: string) => request('/nodes/' + id),
  getNodeMetrics: (id: string, params?: { startTime?: string; endTime?: string }) => {
    const query = new URLSearchParams();
    if (params?.startTime) query.append('startTime', params.startTime);
    if (params?.endTime) query.append('endTime', params.endTime);
    return request('/nodes/' + id + '/metrics?' + query.toString());
  },
  registerNode: (data: { name: string; ipAddress: string }) =>
    request('/nodes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  unregisterNode: (id: string) =>
    request('/nodes/' + id, { method: 'DELETE' }),

  getResults: (params?: {
    page?: number;
    pageSize?: number;
    taskId?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', params.page.toString());
    if (params?.pageSize) query.append('pageSize', params.pageSize.toString());
    if (params?.taskId) query.append('taskId', params.taskId);
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);
    return request('/results?' + query.toString());
  },
  getResultById: (id: string) => request('/results/' + id),
  getResultsByTaskId: (taskId: string) =>
    request('/results/task/' + taskId),
  downloadResult: (id: string, format: 'json' | 'csv' = 'json') =>
    request('/results/' + id + '/download?format=' + format),
  getResultReport: (taskId: string) =>
    request('/results/task/' + taskId + '/report'),
};
