import axios from 'axios'
import type { 
  ProcessResult, 
  DocumentRecord, 
  SearchParams, 
  PaginatedResponse,
  CorrectionRequest,
  BatchExportRequest,
  BatchOperationResult,
  SystemStatsResponse
} from '@/types'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 60000
})

export const documentApi = {
  async uploadAndProcess(file: File): Promise<ProcessResult> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post<ProcessResult>('/documents/process', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  async getById(id: string): Promise<DocumentRecord> {
    const response = await api.get<DocumentRecord>(`/documents/${id}`)
    return response.data
  },

  async list(params: SearchParams): Promise<PaginatedResponse> {
    const response = await api.get<PaginatedResponse>('/documents', { params })
    return response.data
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/documents/${id}`)
  },

  async getHealth(): Promise<{ status: string }> {
    const response = await api.get<{ status: string }>('/health')
    return response.data
  },

  async updateDocument(id: string, data: CorrectionRequest): Promise<DocumentRecord> {
    const response = await api.put<DocumentRecord>(`/documents/${id}`, data)
    return response.data
  },

  async exportDocuments(data: BatchExportRequest): Promise<Blob> {
    const response = await api.post('/documents/export', data, {
      responseType: 'blob'
    })
    return response.data
  },

  async batchDelete(ids: string[]): Promise<BatchOperationResult> {
    const response = await api.delete<BatchOperationResult>('/documents/batch', {
      data: { ids }
    })
    return response.data
  },

  async getSystemStats(): Promise<SystemStatsResponse> {
    const response = await api.get<SystemStatsResponse>('/documents/stats/system')
    return response.data
  }
}
