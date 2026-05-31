import React, { useState } from 'react'
import { Upload, Progress, Button, message, Image } from 'antd'
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { useUpload } from '@/hooks'
import { formatFileSize } from '@/utils'
import { FileUploadResult } from '@/types'
import styles from './index.module.css'

interface ImageUploaderProps {
  value?: FileUploadResult[]
  onChange?: (files: FileUploadResult[]) => void
  maxCount?: number
  accept?: string
  disabled?: boolean
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  value = [],
  onChange,
  maxCount = 10,
  accept = 'image/*',
  disabled = false
}) => {
  const { uploading, progress, uploadFile } = useUpload()
  const [uploadingFile, setUploadingFile] = useState<File | null>(null)

  const handleUpload = async (file: File) => {
    try {
      setUploadingFile(file)
      const result = await uploadFile(file)
      const newValue = [...value, result]
      onChange?.(newValue)
      message.success('上传成功')
    } catch (error) {
      message.error('上传失败')
    } finally {
      setUploadingFile(null)
    }
    return false
  }

  const handleRemove = (index: number) => {
    const newValue = value.filter((_, i) => i !== index)
    onChange?.(newValue)
  }

  const uploadProps: UploadProps = {
    accept,
    showUploadList: false,
    beforeUpload: handleUpload,
    disabled: disabled || uploading || value.length >= maxCount
  }

  return (
    <div className={styles.uploader}>
      <div className={styles.uploadList}>
        {value.map((file, index) => (
          <div key={file.fileId} className={styles.uploadItem}>
            <div className={styles.imageWrapper}>
              <Image src={file.fileUrl} alt={file.fileName} width="100%" height="100%" style={{ objectFit: 'cover' }} />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleRemove(index)}
                className={styles.deleteBtn}
              />
            </div>
            <div className={styles.fileInfo}>
              <div className={styles.fileName} title={file.fileName}>
                {file.fileName}
              </div>
              <div className={styles.fileSize}>{formatFileSize(file.fileSize)}</div>
            </div>
          </div>
        ))}
        {uploadingFile && (
          <div className={styles.uploadItem}>
            <div className={styles.uploadingWrapper}>
              <UploadOutlined className={styles.uploadingIcon} />
              <Progress type="circle" percent={progress} size={60} />
            </div>
            <div className={styles.fileInfo}>
              <div className={styles.fileName}>{uploadingFile.name}</div>
              <div className={styles.fileSize}>上传中...</div>
            </div>
          </div>
        )}
        {value.length < maxCount && !uploading && (
          <Upload {...uploadProps}>
            <div className={styles.uploadBtn}>
              <UploadOutlined className={styles.uploadIcon} />
              <div className={styles.uploadText}>点击上传</div>
              <div className={styles.uploadHint}>支持图片文件</div>
            </div>
          </Upload>
        )}
      </div>
    </div>
  )
}

export default ImageUploader
