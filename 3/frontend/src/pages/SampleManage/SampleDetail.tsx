import React, { useState, useEffect } from 'react'
import { Modal, Tabs, Descriptions, Table, Button, Space, Popconfirm, message } from 'antd'
import { UploadOutlined, DownloadOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons'
import { SampleMetadata } from '../../types'
import { formatDate, formatFileSize } from '../../utils/format'
import { getAttachmentsBySample, deleteAttachment, downloadAttachment, getPresignedUrl, Attachment } from '../../api/attachment'
import UploadModal from '../AttachmentManage/UploadModal'

interface SampleDetailProps {
  visible: boolean
  sample: SampleMetadata | null
  onCancel: () => void
  onSuccess: () => void
}

const SampleDetail: React.FC<SampleDetailProps> = ({ visible, sample, onCancel, onSuccess }) => {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadVisible, setUploadVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (visible && sample?.id) {
      fetchAttachments(sample.id)
    }
  }, [visible, sample])

  const fetchAttachments = async (sampleId: number) => {
    setLoading(true)
    try {
      const response = await getAttachmentsBySample(sampleId)
      if (response.code === 200) {
        setAttachments(response.data)
      } else {
        message.error(response.message || '获取附件列表失败')
      }
    } catch (error) {
      console.error('Fetch attachments error:', error)
      message.error('获取附件列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = (id: number) => {
    try {
      downloadAttachment(id)
      message.success('开始下载')
    } catch (error) {
      message.error('下载失败')
    }
  }

  const handleGetUrl = async (id: number) => {
    try {
      const response = await getPresignedUrl(id, 60)
      if (response.code === 200) {
        navigator.clipboard.writeText(response.data)
        message.success('预签名URL已复制到剪贴板')
      } else {
        message.error(response.message || '获取URL失败')
      }
    } catch (error) {
      message.error('获取URL失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const response = await deleteAttachment(id)
      if (response.code === 200) {
        message.success('删除成功')
        if (sample?.id) {
          fetchAttachments(sample.id)
        }
      } else {
        message.error(response.message || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const attachmentColumns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
    },
    {
      title: '文件大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      render: (text: number) => formatFileSize(text),
    },
    {
      title: '文件类型',
      dataIndex: 'contentType',
      key: 'contentType',
    },
    {
      title: '上传时间',
      dataIndex: 'uploadedAt',
      key: 'uploadedAt',
      render: (text: string) => formatDate(text),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Attachment) => (
        <Space size="small">
          <Button
            type="link"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(record.id!)}
          >
            下载
          </Button>
          <Button
            type="link"
            icon={<LinkOutlined />}
            onClick={() => handleGetUrl(record.id!)}
          >
            获取链接
          </Button>
          <Popconfirm title="确定要删除吗？" onConfirm={() => handleDelete(record.id!)}>
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const items = [
    {
      key: '1',
      label: '基本信息',
      children: (
        <Descriptions column={2} bordered>
          <Descriptions.Item label="样本编号">{sample?.sampleCode}</Descriptions.Item>
          <Descriptions.Item label="样本名称">{sample?.sampleName}</Descriptions.Item>
          <Descriptions.Item label="样本类型">{sample?.sampleType}</Descriptions.Item>
          <Descriptions.Item label="状态">{sample?.status}</Descriptions.Item>
          <Descriptions.Item label="来源">{sample?.source || '-'}</Descriptions.Item>
          <Descriptions.Item label="存储位置">{sample?.storageLocation || '-'}</Descriptions.Item>
          <Descriptions.Item label="容量">{sample?.volume ? `${sample.volume} ${sample.unit || ''}` : '-'}</Descriptions.Item>
          <Descriptions.Item label="部门">{sample?.department}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDate(sample?.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>
            {sample?.description || '-'}
          </Descriptions.Item>
        </Descriptions>
      ),
    },
    {
      key: '2',
      label: '附件',
      children: (
        <div>
          <div style={{ marginBottom: 16, textAlign: 'right' }}>
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadVisible(true)}>
              上传附件
            </Button>
          </div>
          <Table
            columns={attachmentColumns}
            dataSource={attachments}
            loading={loading}
            rowKey="id"
            pagination={false}
          />
        </div>
      ),
    },
    {
      key: '3',
      label: '验证历史',
      children: (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p>暂无验证历史记录</p>
        </div>
      ),
    },
  ]

  return (
    <>
      <Modal
        title="样本详情"
        open={visible}
        onCancel={onCancel}
        onOk={onCancel}
        width={800}
        footer={null}
      >
        <Tabs items={items} />
      </Modal>
      <UploadModal
        sampleId={sample?.id || 0}
        visible={uploadVisible}
        onCancel={() => setUploadVisible(false)}
        onSuccess={() => {
          setUploadVisible(false)
          if (sample?.id) {
            fetchAttachments(sample.id)
          }
        }}
      />
    </>
  )
}

export default SampleDetail
