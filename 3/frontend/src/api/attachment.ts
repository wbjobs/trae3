import axiosInstance from './axios'

export interface Attachment {
  id: number
  sampleId: number
  fileName: string
  filePath: string
  fileSize: number
  contentType: string
  storageType: string
  uploadedBy: number
  uploadedAt: string
  tenantId: number
}

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export const uploadAttachment = (sampleId: number, file: File): Promise<ApiResponse<Attachment>> => {
  const formData = new FormData()
  formData.append('sampleId', String(sampleId))
  formData.append('file', file)
  return axiosInstance.post('/attachments/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

export const getAttachmentsBySample = (sampleId: number): Promise<ApiResponse<Attachment[]>> => {
  return axiosInstance.get(`/attachments/sample/${sampleId}`)
}

export const deleteAttachment = (id: number): Promise<ApiResponse<void>> => {
  return axiosInstance.delete(`/attachments/${id}`)
}

export const getPresignedUrl = (id: number, minutes?: number): Promise<ApiResponse<string>> => {
  const params = minutes ? { minutes } : {}
  return axiosInstance.get(`/attachments/${id}/url`, { params })
}

export const downloadAttachment = (id: number) => {
  window.open(`/api/attachments/${id}/download`, '_blank')
}
