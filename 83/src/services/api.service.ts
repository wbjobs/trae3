import {
  RubbingMetadata,
  SearchQuery,
  SearchResult,
  FileValidationResult,
  FileInfo,
  WorkflowRecord,
  Version,
  UploadSession,
} from '../../shared/types';

const getAuthHeader = (): HeadersInit => {
  const token = getAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};

const getAuthToken = (): string | null => {
  const token = localStorage.getItem('auth-storage');
  if (token) {
    try {
      const parsed = JSON.parse(token);
      if (parsed.state?.token) {
        return parsed.state.token;
      }
    } catch (e) {
    }
  }
  return null;
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || '请求失败');
  }
  return data.data as T;
};

export const apiService = {
  async uploadInit(fileName: string, totalSize: number): Promise<UploadSession & { chunkSize: number }> {
    const response = await fetch('/api/upload/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ fileName, totalSize }),
    });
    return handleResponse(response);
  },

  async uploadChunk(
    sessionId: string,
    chunkIndex: number,
    chunk: Blob
  ): Promise<{ success: boolean; uploadedChunks: number; totalChunks: number }> {
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('chunk', chunk);

    const response = await fetch('/api/upload/chunk', {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
      },
      body: formData,
    });
    return handleResponse(response);
  },

  async uploadComplete(sessionId: string, rubbingId?: string): Promise<{ fileInfo: FileInfo; rubbingId: string }> {
    const response = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ sessionId, rubbingId }),
    });
    return handleResponse(response);
  },

  async validateFile(file: File): Promise<FileValidationResult> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload/validate', {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
      },
      body: formData,
    });
    return handleResponse(response);
  },

  async getUploadProgress(sessionId: string): Promise<{
    progress: number;
    uploadedChunks: number;
    totalChunks: number;
  }> {
    const response = await fetch(`/api/upload/progress/${sessionId}`, {
      headers: getAuthHeader(),
    });
    return handleResponse(response);
  },

  async getRubbings(page = 1, pageSize = 20, status?: string): Promise<SearchResult<RubbingMetadata>> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (status) params.append('status', status);

    const response = await fetch(`/api/rubbings?${params}`, {
      headers: getAuthHeader(),
    });
    return handleResponse(response);
  },

  async getRubbing(id: string): Promise<RubbingMetadata> {
    const response = await fetch(`/api/rubbings/${id}`, {
      headers: getAuthHeader(),
    });
    return handleResponse(response);
  },

  async createRubbing(data: Partial<RubbingMetadata>): Promise<{ id: string }> {
    const response = await fetch('/api/rubbings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async updateRubbing(id: string, data: Partial<RubbingMetadata>): Promise<RubbingMetadata> {
    const response = await fetch(`/api/rubbings/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async batchImportRubbings(records: Array<Record<string, unknown>>): Promise<{
    total: number;
    success: number;
    failed: number;
    results: Array<{ row: number; accessionNo: string; title: string; success: boolean; error?: string; rubbingId?: string }>;
  }> {
    const response = await fetch('/api/rubbings/batch-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ records }),
    });
    return handleResponse(response);
  },

  getExportUrl(filters?: { keyword?: string; status?: string; dynasty?: string }): string {
    const token = getAuthToken();
    let url = '/api/rubbings/export';
    const params: string[] = [];
    if (filters?.keyword) params.push(`keyword=${encodeURIComponent(filters.keyword)}`);
    if (filters?.status) params.push(`status=${encodeURIComponent(filters.status)}`);
    if (filters?.dynasty) params.push(`dynasty=${encodeURIComponent(filters.dynasty)}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    return token ? `${url}${params.length > 0 ? '&' : '?'}token=${token}` : url;
  },

  getImportTemplateUrl(): string {
    const token = getAuthToken();
    return token ? `/api/rubbings/import-template?token=${token}` : '/api/rubbings/import-template';
  },

  async deleteRubbing(id: string): Promise<void> {
    const response = await fetch(`/api/rubbings/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    await handleResponse(response);
  },

  async submitRubbing(id: string, comment?: string): Promise<WorkflowRecord> {
    const response = await fetch(`/api/rubbings/${id}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ comment }),
    });
    return handleResponse(response);
  },

  async approveRubbing(id: string, comment?: string): Promise<WorkflowRecord> {
    const response = await fetch(`/api/rubbings/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ comment }),
    });
    return handleResponse(response);
  },

  async rejectRubbing(id: string, comment?: string): Promise<WorkflowRecord> {
    const response = await fetch(`/api/rubbings/${id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ comment }),
    });
    return handleResponse(response);
  },

  async getWorkflowHistory(id: string): Promise<WorkflowRecord[]> {
    const response = await fetch(`/api/rubbings/${id}/workflow`, {
      headers: getAuthHeader(),
    });
    return handleResponse(response);
  },

  async getVersions(id: string): Promise<Version[]> {
    const response = await fetch(`/api/rubbings/${id}/versions`, {
      headers: getAuthHeader(),
    });
    return handleResponse(response);
  },

  async getAvailableActions(id: string): Promise<Array<{ action: string; label: string }>> {
    const response = await fetch(`/api/rubbings/${id}/available-actions`, {
      headers: getAuthHeader(),
    });
    return handleResponse(response);
  },

  async search(query: SearchQuery): Promise<SearchResult<RubbingMetadata>> {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(query),
    });
    return handleResponse(response);
  },

  async getSearchFilters(): Promise<{
    dynasties: string[];
    eras: string[];
    authors: string[];
    methods: string[];
    statuses: string[];
  }> {
    const response = await fetch('/api/search/filters', {
      headers: getAuthHeader(),
    });
    return handleResponse(response);
  },

  async getSuggestions(q: string): Promise<Array<{ text: string; type: string }>> {
    const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(q)}`, {
      headers: getAuthHeader(),
    });
    return handleResponse(response);
  },

  async getFileInfo(fileId: string): Promise<FileInfo> {
    const response = await fetch(`/api/files/${fileId}`, {
      headers: getAuthHeader(),
    });
    return handleResponse(response);
  },

  async getFileByRubbingId(rubbingId: string): Promise<FileInfo> {
    const response = await fetch(`/api/files/rubbing/${rubbingId}`, {
      headers: getAuthHeader(),
    });
    return handleResponse(response);
  },

  getPreviewUrl(fileId: string, type: 'thumb' | 'preview' = 'thumb'): string {
    const token = getAuthToken();
    const base = `/api/files/${fileId}/preview?type=${type}`;
    return token ? `${base}&token=${token}` : base;
  },

  getDownloadUrl(fileId: string): string {
    const token = getAuthToken();
    const base = `/api/files/${fileId}/download`;
    return token ? `${base}?token=${token}` : base;
  },

  getFileUrl(fileId: string): string {
    const token = getAuthToken();
    const base = `/api/files/${fileId}`;
    return token ? `${base}?token=${token}` : base;
  },

  async searchRubbings(query: {
    keyword?: string;
    status?: string;
    dynasty?: string;
    era?: string;
    author?: string;
    page?: number;
    pageSize?: number;
  }): Promise<SearchResult<RubbingMetadata>> {
    return apiService.search({
      keyword: query.keyword,
      dynasty: query.dynasty,
      era: query.era,
      author: query.author,
      status: query.status ? [query.status] as any : undefined,
      page: query.page || 1,
      pageSize: query.pageSize || 20,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
  },

  async getSearchSuggestions(q: string): Promise<string[]> {
    const suggestions = await apiService.getSuggestions(q);
    return suggestions.map((s) => s.text);
  },
};
