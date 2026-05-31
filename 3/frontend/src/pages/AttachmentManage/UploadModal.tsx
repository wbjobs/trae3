import React, { useState } from 'react'
import { Modal, Upload, message, Progress } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { uploadAttachment } from '../../api/attachment'
import { UploadChangeParam, UploadFile } from 'antd/es/upload/interface'

interface UploadModalProps {
  sampleId: number
  visible: boolean
  onCancel: () => void
  onSuccess: () => void
}

const UploadModal: React.FC<UploadModalProps> = ({ sampleId, visible, onCancel, onSuccess }) => {
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning('请选择要上传的文件')
      return
    }

    setUploading(true)
    setProgress(0)

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i]
        if (file.originFileObj) {
          const response = await uploadAttachment(sampleId, file.originFileObj)
          if (response.code !== 200) {
            throw new Error(response.message || '上传失败')
          }
          setProgress(Math.round(((i + 1) / fileList.length) * 100))
        }
      }
      message.success('上传成功')
      setFileList([])
      onSuccess()
    } catch (error: any) {
      console.error('Upload error:', error)
      message.error(error?.message || '上传失败')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleChange = (info: UploadChangeParam<UploadFile>) => {
    setFileList(info.fileList)
  }

  const handleCancel = () => {
    setFileList([])
    setProgress(0)
    onCancel()
  }

  return (
    <Modal
      title="上传附件"
      open={visible}
      onCancel={handleCancel}
      onOk={handleUpload}
      confirmLoading={uploading}
      okText="上传"
      cancelText="取消"
    >
      <Upload
        multiple
        fileList={fileList}
        onChange={handleChange}
        beforeUpload={() => false}
      >
        <div style={{ padding: '40px', border: '2px dashed #d9d9d9', borderRadius: '8px', textAlign: 'center' }}>
          <UploadOutlined style={{ fontSize: '48px', color: '#1890ff' }} />
          <p style={{ marginTop: '16px', fontSize: '16px' }}>点击或拖拽文件到此处上传</p>
          <p style={{ color: '#666' }}>支持任意文件格式</p>
        </div>
      </Upload>
      {uploading && (
        <div style={{ marginTop: '16px' }}>
          <Progress percent={progress} />
        </div>
      )}
    </Modal>
  )
}

export default UploadModal
