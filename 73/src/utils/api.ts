const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers as Record<string, string> },
    ...options,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || json.errors?.join(', ') || 'Request failed');
  return json.data as T;
}

export const api = {
  getSamples: (params: Record<string, string | number>) => {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    return request<{ total: number; page: number; pageSize: number; items: any[] }>(`/samples?${qs}`);
  },
  getSample: (id: string) => request<any>(`/samples/${id}`),
  createSample: (data: any) => request<any>('/samples', { method: 'POST', body: JSON.stringify(data) }),
  uploadAttachments: (id: string, files: File[]) => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    return fetch(`${BASE}/samples/${id}/attachments`, { method: 'POST', body: formData }).then(r => r.json()).then(j => { if (!j.success) throw new Error(j.error); return j.data; });
  },
  getFlowRecords: (id: string) => request<any[]>(`/samples/${id}/flow-records`),
  getPendingApprovals: (params: Record<string, string | number>) => {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    return request<any>(`/approval/pending?${qs}`);
  },
  getApprovalHistory: (params: Record<string, string | number>) => {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    return request<any>(`/approval/history?${qs}`);
  },
  approveSample: (id: string, data: { action: 'approve' | 'reject'; comment: string }) =>
    request<any>(`/approval/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  getDashboardStats: () => request<any>('/dashboard/stats'),
  getNotifications: (includeRead: boolean = false) => request<any[]>(`/notifications?includeRead=${includeRead}`),
  getUnreadCount: () => request<{ count: number }>('/notifications/unread-count'),
  markNotificationRead: (id: string) => request<void>(`/notifications/${id}/read`, { method: 'POST' }),
  getPendingReminders: () => request<any[]>('/reminders/pending'),
  triggerReminders: () => request<{ count: number }>('/reminders/trigger', { method: 'POST' }),
  exportCSV: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return `${BASE}/export/csv${qs ? `?${qs}` : ''}`;
  },
};
