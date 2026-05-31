import axiosInstance from './axios'
import { ApiResponse } from './sample'
import { BatchImportResult, BatchExportParams } from '../types/batch'

export const importSamples = (file: File): Promise<ApiResponse<BatchImportResult>> => {
  const formData = new FormData()
  formData.append('file', file)
  return axiosInstance.post('/samples/batch/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }).then(res => res.data)
}

export const exportSamples = (params: BatchExportParams): void => {
  const queryString = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')

  const token = localStorage.getItem('token')
  const url = `/api/samples/batch/export${queryString ? `?${queryString}` : ''}`

  const link = document.createElement('a')
  link.href = url
  link.style.display = 'none'
  if (token) {
    link.setAttribute('Authorization', `Bearer ${token}`)
  }
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const downloadTemplate = (): void => {
  const token = localStorage.getItem('token')
  const url = '/api/samples/batch/template'

  const link = document.createElement('a')
  link.href = url
  link.style.display = 'none'
  if (token) {
    link.setAttribute('Authorization', `Bearer ${token}`)
  }
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
