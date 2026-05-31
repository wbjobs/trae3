import request from './request'
import { FileUploadResult, MultipartUploadInitResult, MultipartUploadPartResult, FileInfoResult } from '@/types'

export const storageApi = {
  simpleUpload: (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)
    return request.upload<FileUploadResult>('/storage/upload', formData, onProgress)
  },

  batchUpload: (files: File[], onProgress?: (progress: number) => void) => {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    return request.upload<FileUploadResult[]>('/storage/batch-upload', formData, onProgress)
  },

  getFileInfo: (fileId: number) => {
    return request.get<FileInfoResult>(`/storage/${fileId}`)
  },

  getFileList: (page: number, size: number, keyword?: string) => {
    return request.get('/storage/list', { params: { page, size, keyword } })
  },

  deleteFile: (fileId: number) => {
    return request.delete(`/storage/${fileId}`)
  },

  preview: (objectName: string, expires?: number) => {
    return request.get<string>('/storage/preview', {
      params: { objectName, expires: expires || 3600 }
    })
  },

  initMultipartUpload: (originalName: string, fileSize: number, partCount: number) => {
    return request.post<MultipartUploadInitResult>('/storage/multipart/init', {
      originalName,
      fileSize,
      partCount
    })
  },

  uploadPart: (uploadId: string, partNumber: number, chunk: Blob, onProgress?: (progress: number) => void) => {
    const formData = new FormData()
    formData.append('file', chunk)
    formData.append('uploadId', uploadId)
    formData.append('partNumber', String(partNumber))
    return request.upload<MultipartUploadPartResult>('/storage/multipart/upload', formData, onProgress)
  },

  completeMultipartUpload: (uploadId: string, originalName: string, parts: { partNumber: number; etag: string }[]) => {
    return request.post<FileUploadResult>('/storage/multipart/complete', {
      uploadId,
      originalName,
      parts
    })
  }
}

export default storageApi
