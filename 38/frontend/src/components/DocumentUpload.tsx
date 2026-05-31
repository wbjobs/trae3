import React, { useState, useRef, useCallback } from 'react'
import {
  Upload,
  Button,
  Progress,
  List,
  Card,
  Row,
  Col,
  Tag,
  Space,
  message,
  Select,
  Divider,
} from 'antd'
import {
  InboxOutlined,
  CloudUploadOutlined,
  FileTextOutlined,
  PictureOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { api, UploadResponse, ParsedContent } from '../services/api'

const { Dragger } = Upload
const { Option } = Select

interface UploadItem {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  response?: UploadResponse
  parsed?: ParsedContent
  error?: string
}

const DocumentUpload: React.FC<{
  onParseComplete?: (docId: string) => void
}> = ({ onParseComplete }) => {
  const [items, setItems] = useState<UploadItem[]>([])
  const [totalProgress, setTotalProgress] = useState(0)
  const [domain, setDomain] = useState('通用')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (['pdf'].includes(ext || '')) return <FilePdfOutlined style={{ color: '#ff4d4f' }} />
    if (['doc', 'docx'].includes(ext || '')) return <FileWordOutlined style={{ color: '#1677ff' }} />
    if (['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'gif'].includes(ext || ''))
      return <PictureOutlined style={{ color: '#52c41a' }} />
    return <FileTextOutlined style={{ color: '#faad14' }} />
  }

  const handleFiles = useCallback(async (files: File[]) => {
    const newItems: UploadItem[] = files.map((file) => ({
      file,
      status: 'pending',
      progress: 0,
    }))
    setItems((prev) => [...prev, ...newItems])

    for (let i = 0; i < newItems.length; i++) {
      const idx = items.length + i
      const item = newItems[i]
      try {
        setItems((prev) => {
          const updated = [...prev]
          updated[idx] = { ...updated[idx], status: 'uploading', progress: 10 }
          return updated
        })

        const response = await api.uploadFile(item.file)
        const docId = response.data.doc_id
        const parsedResponse = await api.getParsedContent(docId)

        setItems((prev) => {
          const updated = [...prev]
          updated[idx] = {
            ...updated[idx],
            status: 'success',
            progress: 100,
            response: response.data,
            parsed: parsedResponse.data,
          }
          return updated
        })
        message.success(`${item.file.name} 上传解析成功`)
        onParseComplete?.(docId)
      } catch (e: any) {
        setItems((prev) => {
          const updated = [...prev]
          updated[idx] = {
            ...updated[idx],
            status: 'error',
            progress: 100,
            error: e.response?.data?.detail || e.message,
          }
          return updated
        })
        message.error(`${item.file.name} 上传失败: ${e.message}`)
      }
      setTotalProgress(Math.round(((i + 1) / newItems.length) * 100))
    }
  }, [items.length, onParseComplete])

  const uploadProps: UploadProps = {
    multiple: true,
    showUploadList: false,
    beforeUpload: () => false,
    onChange: (info) => {
      if (info.fileList.length > 0) {
        handleFiles(info.fileList.map((f) => f.originFileObj!).filter(Boolean))
      }
    },
  }

  const handleBatchUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      handleFiles(files)
    }
  }

  const handleExtract = async (docId: string) => {
    try {
      message.loading({ content: '正在抽取知识...', key: 'extract' })
      const response = await api.extractKnowledge(docId, domain)
      const taskId = response.data.task_id

      const checkInterval = setInterval(async () => {
        const status = await api.getTaskStatus(taskId)
        if (status.data.status === 'completed') {
          clearInterval(checkInterval)
          message.success({ content: '知识抽取完成', key: 'extract' })
          onParseComplete?.(docId)
        } else if (status.data.status === 'error') {
          clearInterval(checkInterval)
          message.error({ content: '知识抽取失败', key: 'extract' })
        }
      }, 1000)
    } catch (e: any) {
      message.error(`抽取失败: ${e.message}`)
    }
  }

  const handleExtractAll = async () => {
    const successItems = items.filter((i) => i.status === 'success')
    if (successItems.length === 0) {
      message.warning('没有可抽取的文档')
      return
    }
    try {
      message.loading({ content: '正在批量抽取...', key: 'batch-extract' })
      await api.extractBatch(domain)
      setTimeout(() => {
        message.success({ content: '批量抽取完成', key: 'batch-extract' })
        onParseComplete?.('all')
      }, 3000)
    } catch (e: any) {
      message.error({ content: `批量抽取失败: ${e.message}`, key: 'batch-extract' })
    }
  }

  const handleRemove = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const stats = {
    total: items.length,
    success: items.filter((i) => i.status === 'success').length,
    uploading: items.filter((i) => i.status === 'uploading').length,
    error: items.filter((i) => i.status === 'error').length,
  }

  return (
    <div>
      <Card
        title="文档上传"
        extra={
          <Space>
            <Select value={domain} onChange={setDomain} style={{ width: 150 }}>
              <Option value="通用">通用领域</Option>
              <Option value="医疗">医疗健康</Option>
              <Option value="金融">金融财经</Option>
              <Option value="法律">法律法务</Option>
              <Option value="教育">教育培训</Option>
              <Option value="科技">科技行业</Option>
            </Select>
            <Button icon={<CloudUploadOutlined />} onClick={handleBatchUpload}>
              选择文件批量上传
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.bmp,.tiff,.docx,.txt,.md"
              style={{ display: 'none' }}
              onChange={handleInputChange}
            />
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleExtractAll}>
              全部抽取
            </Button>
          </Space>
        }
      >
        <Row gutter={16}>
          <Col span={24}>
            <Dragger {...uploadProps}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或将文件拖拽到此处上传</p>
              <p className="ant-upload-hint">
                支持 PDF、Word、图片 (PNG/JPG/BMP)、文本文件等，支持批量上传，单个文件最大 50MB
              </p>
            </Dragger>
          </Col>
        </Row>

        {items.length > 0 && (
          <>
            <Divider />
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Card size="small">
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold' }}>{stats.total}</div>
                    <div style={{ color: '#666' }}>总文件</div>
                  </div>
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
                      {stats.success}
                    </div>
                    <div style={{ color: '#666' }}>成功</div>
                  </div>
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1677ff' }}>
                      {stats.uploading}
                    </div>
                    <div style={{ color: '#666' }}>处理中</div>
                  </div>
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#ff4d4f' }}>
                      {stats.error}
                    </div>
                    <div style={{ color: '#666' }}>失败</div>
                  </div>
                </Card>
              </Col>
            </Row>

            {totalProgress > 0 && totalProgress < 100 && (
              <Progress percent={totalProgress} status="active" style={{ marginBottom: 16 }} />
            )}

            <List
              dataSource={items}
              renderItem={(item, idx) => (
                <List.Item
                  actions={[
                    item.status === 'success' && (
                      <Button
                        type="link"
                        size="small"
                        icon={<PlayCircleOutlined />}
                        onClick={() => handleExtract(item.response!.doc_id)}
                      >
                        知识抽取
                      </Button>
                    ),
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemove(idx)}
                    >
                      移除
                    </Button>,
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    avatar={fileIcon(item.file.name)}
                    title={
                      <Space>
                        {item.file.name}
                        {item.status === 'success' && <Tag color="green">成功</Tag>}
                        {item.status === 'uploading' && <Tag color="blue">上传中</Tag>}
                        {item.status === 'error' && <Tag color="red">失败</Tag>}
                      </Space>
                    }
                    description={
                      <Space>
                        <span>
                          {item.parsed?.page_count || 0} 页 / {item.parsed?.images?.length || 0} 张图片
                        </span>
                        <span>
                          {(item.file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                        {item.parsed?.text_content && (
                          <span>
                            {item.parsed.text_content.length.toLocaleString()} 字符
                          </span>
                        )}
                        {item.status === 'uploading' && (
                          <Progress
                            percent={item.progress}
                            size="small"
                            style={{ width: 100 }}
                          />
                        )}
                        {item.error && <Tag color="red">{item.error}</Tag>}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </>
        )}
      </Card>
    </div>
  )
}

export default DocumentUpload
