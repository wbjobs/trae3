import { FaultAlert, FilterParams, MetricResult, SensorData, Device } from '../types';

const DEV = import.meta.env.DEV;
const API_BASE = DEV ? 'http://localhost:8001/api' : '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (json.status !== 'ok') {
    throw new Error(json.message || 'Request failed');
  }
  return json;
}

export async function queryData(params: {
  device_id?: string;
  start_time?: string;
  end_time?: string;
  parameters?: string[];
  limit?: number;
}) {
  return request<{ data: SensorData[]; count: number }>('/data/query', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getLatestData(deviceId: string, limit = 100) {
  return request<{ data: SensorData[] }>(`/data/latest/${deviceId}?limit=${limit}`);
}

export async function getMetrics(deviceId: string) {
  return request<{ data: MetricResult[]; buffer_size: number }>(`/metrics/${deviceId}`);
}

export async function queryFaults(params: FilterParams) {
  return request<{ data: FaultAlert[]; count: number }>('/faults/query', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function acknowledgeFault(alertId: string) {
  return request(`/faults/${alertId}/acknowledge`, { method: 'PUT' });
}

export async function getFaultStats() {
  return request<{ data: { total: number; critical: number; warning: number; unacknowledged: number } }>('/faults/stats');
}

export async function getDevices() {
  return request<{ data: Device[] }>('/devices');
}
