import type { Detection, DetectionListResponse, DashboardStats, FaultRegion, FaultClassification } from '../../shared/types';

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error('Request failed');
  const json = await res.json();
  return json.data as T;
}

export async function uploadImages(files: File[]): Promise<Detection> {
  const formData = new FormData();
  formData.append('file', files[0]);
  const res = await fetch('/api/detect/upload', {
    method: 'POST',
    body: formData,
  });
  return parseResponse<Detection>(res);
}

export async function getDetection(id: string): Promise<Detection> {
  const res = await fetch(`/api/detect/${id}`);
  return parseResponse<Detection>(res);
}

export async function getDetectionList(params?: Record<string, string | number>): Promise<DetectionListResponse> {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== '' && value !== undefined) query.set(key, String(value));
    });
  }
  const res = await fetch(`/api/detect/list?${query.toString()}`);
  return parseResponse<DetectionListResponse>(res);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch('/api/dashboard/stats');
  return parseResponse<DashboardStats>(res);
}

export async function updateAnnotation(
  id: string,
  regions: FaultRegion[],
  classifications: FaultClassification[]
): Promise<Detection> {
  const res = await fetch(`/api/detect/${id}/annotations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ regions, classifications }),
  });
  return parseResponse<Detection>(res);
}

export async function batchExport(
  ids: string[],
  format: 'json' | 'pdf' | 'excel'
): Promise<{ format: string; filename: string; base64?: string; downloadUrl?: string; count: number }> {
  const res = await fetch('/api/detect/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, format }),
  });
  return parseResponse(res);
}
