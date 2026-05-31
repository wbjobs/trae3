import { useState, useCallback } from 'react'
import { storageApi } from '@/api'
import { FileUploadResult } from '@/types'

interface UploadState {
  uploading: boolean
  progress: number
  error: string | null
  result: FileUploadResult | null
}

const CHUNK_SIZE = 5 * 1024 * 1024

export const useUpload = () => {
  const [state, setState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
    result: null
  })

  const uploadFile = useCallback(async (file: File): Promise<FileUploadResult> => {
    setState({ uploading: true, progress: 0, error: null, result: null })

    try {
      if (file.size > CHUNK_SIZE) {
        return await multipartUpload(file)
      } else {
        return await simpleUpload(file)
      }
    } catch (error: any) {
      setState(prev => ({ ...prev, uploading: false, error: error.message }))
      throw error
    }
  }, [])

  const simpleUpload = useCallback(async (file: File): Promise<FileUploadResult> => {
    const res = await storageApi.simpleUpload(file, (progress) => {
      setState(prev => ({ ...prev, progress }))
    })
    setState({ uploading: false, progress: 100, error: null, result: res.data })
    return res.data
  }, [])

  const multipartUpload = useCallback(async (file: File): Promise<FileUploadResult> => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
    
    const initRes = await storageApi.initMultipartUpload(file.name, file.size, totalChunks)
    const { uploadId } = initRes.data

    const parts: { partNumber: number; etag: string }[] = []

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, file.size)
      const chunk = file.slice(start, end)

      const partRes = await storageApi.uploadPart(uploadId, i + 1, chunk, (progress) => {
        const overallProgress = Math.round(((i + progress / 100) / totalChunks) * 100)
        setState(prev => ({ ...prev, progress: overallProgress }))
      })

      parts.push({ partNumber: i + 1, etag: partRes.data?.etag || String(i + 1) })
    }

    const completeRes = await storageApi.completeMultipartUpload(uploadId, file.name, parts)
    setState({ uploading: false, progress: 100, error: null, result: completeRes.data })
    return completeRes.data
  }, [])

  const reset = useCallback(() => {
    setState({ uploading: false, progress: 0, error: null, result: null })
  }, [])

  return {
    ...state,
    uploadFile,
    reset
  }
}

export default useUpload
