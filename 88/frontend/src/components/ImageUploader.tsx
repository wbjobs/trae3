import React, { useRef, useState, useCallback } from 'react'
import { Button, message, Progress } from 'antd'
import { UploadOutlined, ScanOutlined } from '@ant-design/icons'
import type { RecognitionResponse } from '../types'
import { ocrApi } from '../services/api'

interface ImageUploaderProps {
  onRecognizeComplete: (result: RecognitionResponse, imageUrl: string) => void
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onRecognizeComplete }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }

    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      message.error('图片大小不能超过10MB')
      return
    }

    setSelectedFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleRecognize = async () => {
    if (!selectedFile) {
      message.warning('请先选择图片')
      return
    }

    setIsRecognizing(true)
    setProgress(0)

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 300)

      const response = await ocrApi.recognize(selectedFile)
      clearInterval(progressInterval)
      setProgress(100)

      message.success('识别完成！')
      onRecognizeComplete(response.data, previewUrl)

      setTimeout(() => {
        setSelectedFile(null)
        setPreviewUrl('')
        setProgress(0)
      }, 500)
    } catch (error: any) {
      message.error(error.response?.data?.detail || '识别失败，请重试')
    } finally {
      setIsRecognizing(false)
    }
  }

  const handleClear = () => {
    setSelectedFile(null)
    setPreviewUrl('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {!previewUrl ? (
        <div
          className={`upload-area ${isDragging ? 'drag-over' : ''}`}
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <UploadOutlined style={{ fontSize: 48, color: '#1677ff', marginBottom: 16 }} />
          <h3 style={{ marginBottom: 8 }}>点击或拖拽上传铭牌图片</h3>
          <p style={{ color: '#666', margin: 0 }}>
            支持 JPG、PNG、BMP 格式，单张图片不超过 10MB
          </p>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <img
            src={previewUrl}
            alt="预览"
            className="image-preview"
            style={{ marginBottom: 16 }}
          />
          <div style={{ marginBottom: 16 }}>
            <span style={{ color: '#666' }}>已选择：{selectedFile?.name}</span>
          </div>
          {isRecognizing && (
            <div style={{ marginBottom: 16 }}>
              <Progress percent={progress} status="active" />
              <p style={{ color: '#666', marginTop: 8 }}>正在识别中，请稍候...</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Button
              type="primary"
              icon={<ScanOutlined />}
              onClick={handleRecognize}
              loading={isRecognizing}
              size="large"
            >
              开始识别
            </Button>
            <Button onClick={handleClear} size="large" disabled={isRecognizing}>
              重新选择
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImageUploader
