import type { ArchiveMetadata, QualityRecord, UploadTask, PaginatedResponse, ApiResponse } from '../../shared/types';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    return await response.json();
  } catch (error) {
    return {
      success: false,
      message: '网络请求失败',
    };
  }
}

export const uploadApi = {
  initUpload: (fileName: string, fileSize: number) =>
    request<{ taskId: string; fileType: string }>('/upload/init', {
      method: 'POST',
      body: JSON.stringify({ fileName, fileSize }),
    }),

  uploadChunk: (taskId: string, chunkIndex: number, chunk: Blob) => {
    const formData = new FormData();
    formData.append('taskId', taskId);
    formData.append('chunkIndex', String(chunkIndex));
    formData.append('chunk', chunk);
    return request<{ chunkIndex: number; received: boolean }>('/upload/chunk', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  completeUpload: (taskId: string, metadata: any) =>
    request<{ archiveId: string }>('/upload/complete', {
      method: 'POST',
      body: JSON.stringify({ taskId, metadata }),
    }),

  getTasks: () =>
    request<UploadTask[]>('/upload/tasks'),
};

export const qualityApi = {
  getPending: (page: number = 1, pageSize: number = 10) =>
    request<PaginatedResponse<ArchiveMetadata>>(`/quality/pending?page=${page}&pageSize=${pageSize}`),

  getChecked: (page: number = 1, pageSize: number = 10) =>
    request<PaginatedResponse<ArchiveMetadata>>(`/quality/checked?page=${page}&pageSize=${pageSize}`),

  submitCheck: (archiveId: string, data: any) =>
    request<{ record: QualityRecord; archive: ArchiveMetadata }>(`/quality/${archiveId}/check`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  batchCheck: (data: {
    archiveIds: string[];
    result: 'PASS' | 'FAIL';
    inspector: string;
    comments?: string;
  }) =>
    request<{
      total: number;
      success: number;
      failed: number;
      results: Array<{ archiveId: string; success: boolean; message?: string }>;
    }>('/quality/batch/check', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateReport: (inspector?: string) =>
    request<any>(`/quality/report/generate${inspector ? `?inspector=${inspector}` : ''}`),

  downloadReport: (inspector?: string, format: string = 'html') =>
    request<{ reportId: string; htmlContent: string }>(
      `/quality/report/download?format=${format}${inspector ? `&inspector=${inspector}` : ''}`
    ),

  getRecords: (archiveId: string) =>
    request<QualityRecord[]>(`/quality/${archiveId}/records`),

  getAllRecords: (page: number = 1, pageSize: number = 10) =>
    request<PaginatedResponse<QualityRecord>>(`/quality/records?page=${page}&pageSize=${pageSize}`),
};

export const archiveApi = {
  getArchives: (params?: {
    keyword?: string;
    fileType?: string[];
    status?: string[];
    coordinateSystem?: string[];
    scale?: string[];
    page?: number;
    pageSize?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.keyword) query.append('keyword', params.keyword);
    if (params?.fileType?.length) query.append('fileType', params.fileType.join(','));
    if (params?.status?.length) query.append('status', params.status.join(','));
    if (params?.coordinateSystem?.length) query.append('coordinateSystem', params.coordinateSystem.join(','));
    if (params?.scale?.length) query.append('scale', params.scale.join(','));
    query.append('page', String(params?.page || 1));
    query.append('pageSize', String(params?.pageSize || 10));
    return request<PaginatedResponse<ArchiveMetadata>>(`/archive?${query.toString()}`);
  },

  getStatistics: () =>
    request<{ total: number; approved: number; pending: number; totalSize: number }>('/archive/statistics'),

  getArchive: (id: string) =>
    request<ArchiveMetadata>(`/archive/${id}`),

  downloadArchive: (id: string) =>
    request<{ downloadUrl: string; fileName: string }>(`/archive/${id}/download`),

  getHistory: (id: string) =>
    request<QualityRecord[]>(`/archive/${id}/history`),
};
