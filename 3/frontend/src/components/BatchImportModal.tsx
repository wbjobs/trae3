import React, { useState, useCallback } from 'react'
import { Modal, Upload, Button, Progress, Space, Alert, List, Typography, message } from 'antd'
import { InboxOutlined, DownloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { importSamples, downloadTemplate } from '../api/batch'
import { BatchImportResult } from '../types/batch'

const { Dragger } = Upload
const { Text, Title } = Typography

interface BatchImportModalProps {
  visible: boolean
  onCancel: () => void
  onSuccess: () => void
}

type ImportStatus = 'idle' | 'uploading' | 'success' | 'error'

const BatchImportModal: React.FC<BatchImportModalProps> = ({ visible, onCancel, onSuccess }) => {
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<BatchImportResult | null>(null)
  const [fileList, setFileList] = useState<UploadProps['fileList']>([])

  const handleReset = useCallback(() => {
    setImportStatus('idle')
    setProgress(0)
    setResult(null)
    setFileList([])
  }, [])

  const handleCancel = useCallback(() => {
    handleReset()
    onCancel()
  }, [handleReset, onCancel])

  const handleDownloadTemplate = useCallback(() => {
    downloadTemplate()
  }, [])

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    fileList,
    accept: '.xlsx,.xls,.csv',
    beforeUpload: (file) => {
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel' ||
        file.name.endsWith('.csv')
      if (!isExcel) {
        message.error('只能上传Excel文件!')
        return false
      }
      const isLt10M = file.size / 1024 / 1024 < 10
      if (!isLt10M) {
        message.error('文件大小不能超过10MB!')
        return false
      }
      return true
    },
    customRequest: async ({ file }) => {
      setImportStatus('uploading')
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
        }, 100)

        const response = await importSamples(file as File)
        
        clearInterval(progressInterval)
        setProgress(100)

        if (response.code === 200) {
          setResult(response.data)
          setImportStatus('success')
          message.success('导入完成')
          setTimeout(() => {
            onSuccess()
          }, 500)
        } else {
          setImportStatus('error')
          message.error(response.message || '导入失败')
        }
      } catch (error) {
        setImportStatus('error')
        message.error('导入失败，请重试')
      }
    },
    onChange: ({ fileList: newFileList }) => {
      setFileList(newFileList.slice(-1))
    },
  }

  return (
    <Modal
      title="批量导入样本"
      open={visible}
      onCancel={handleCancel}
      footer={
        <Space>
          <Button onClick={handleCancel}>关闭</Button>
          {importStatus === 'success' && (
            <Button type="primary" onClick={handleReset}>
              继续导入
            </Button>
          )}
        </Space>
      }
      width={600}
      destroyOnClose
    >
      {importStatus === 'idle' && (
        <>
          <div style={{ marginBottom: 16, textAlign: 'right' }}>
            <Button
              type="link"
              icon={<DownloadOutlined />}
              onClick={handleDownloadTemplate}
            >
              下载导入模板
            </Button>
          </div>
          <Dragger {...uploadProps} disabled={importStatus === 'uploading'}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">
              支持 .xlsx, .xls, .csv 格式，单个文件不超过 10MB
            </p>
          </Dragger>
        </>
      )}

      {importStatus === 'uploading' && (
        <div style={{ padding: '40px 0' }}>
          <Progress percent={progress} status="active" />
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Text type="secondary">正在导入数据，请稍候...</Text>
          </div>
        </div>
      )}

      {(importStatus === 'success' || importStatus === 'error') && result && (
        <div>
          <Alert
            type={result.failCount === 0 ? 'success' : 'warning'}
            showIcon
            message="导入结果"
            description={
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>
                  <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                  成功：{result.successCount} 条
                </Text>
                {result.failCount > 0 && (
                  <Text>
                    <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                    失败：{result.failCount} 条
                  </Text>
                )}
                <Text type="secondary">
                  总计：{result.totalCount} 条，耗时：{(result.elapsedMs / 1000).toFixed(2)} 秒
                </Text>
              </Space>
            }
          />

          {result.errors && result.errors.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Title level={5} style={{ marginBottom: 12 }}>
                错误详情
              </Title>
              <List
                size="small"
                dataSource={result.errors}
                style={{ maxHeight: 200, overflow: 'auto' }}
                renderItem={(error) => (
                  <List.Item>
                    <Text type="danger">{error}</Text>
                  </List.Item>
                )}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default BatchImportModal
