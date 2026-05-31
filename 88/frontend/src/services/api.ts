import axios from 'axios'
import type {
  RecognitionResponse,
  UploadResponse,
  RecordListResponse,
  NameplateRecord,
  StatisticsResponse
} from '../types'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 60000
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export const ocrApi = {
  upload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<UploadResponse>('/ocr/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  recognize: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<RecognitionResponse>('/ocr/recognize', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  reRecognize: (recordId: number) => {
    return api.post<RecognitionResponse>(`/ocr/recognize/${recordId}`)
  }
}

export const recordsApi = {
  list: (params?: {
    page?: number
    page_size?: number
    keyword?: string
    status?: string
  }) => {
    return api.get<RecordListResponse>('/records', { params })
  },

  get: (id: number) => {
    return api.get<NameplateRecord>(`/records/${id}`)
  },

  update: (id: number, data: Partial<NameplateRecord>) => {
    return api.put<NameplateRecord>(`/records/${id}`, data)
  },

  delete: (id: number) => {
    return api.delete(`/records/${id}`)
  },

  statistics: () => {
    return api.get<StatisticsResponse>('/records/statistics/summary')
  }
}

export default api
