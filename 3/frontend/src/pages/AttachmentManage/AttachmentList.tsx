import React, { useState, useEffect } from 'react'
import { Table, Form, Input, DatePicker, Button, Space, Popconfirm, message, Row, Col } from 'antd'
import { DownloadOutlined, LinkOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { deleteAttachment, getPresignedUrl, downloadAttachment, Attachment } from '../../api/attachment'
import { formatDate, formatFileSize } from '../../utils/format'

const AttachmentList: React.FC = () => {
  const [form] = Form.useForm()
  const [data, setData] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [pageNum, setPageNum] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const fetchData = async () => {
    setLoading(true)
    try {
      setData([])
      setTotal(0)
      message.warning('附件列表功能需要后端API支持分页查询')
    } catch (error) {
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [pageNum, pageSize])

  const handleSearch = () => {
    setPageNum(1)
    fetchData()
  }

  const handleReset = () => {
    form.resetFields()
    setPageNum(1)
    fetchData()
  }

  const handleDownload = (id: number) => {
    try {
      downloadAttachment(id)
      message.success('开始下载')
    } catch (error) {
      message.error('下载失败')
    }
  }

  const handleGetPresignedUrl = async (id: number) => {
    try {
      const response = await getPresignedUrl(id, 60)
      if (response.code === 200) {
        await navigator.clipboard.writeText(response.data)
        message.success('预签名URL已复制到剪贴板')
      } else {
        message.error(response.message || '获取预签名URL失败')
      }
    } catch (error) {
      message.error('获取预签名URL失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const response = await deleteAttachment(id)
      if (response.code === 200) {
        message.success('删除成功')
        fetchData()
      } else {
        message.error(response.message || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const columns = [
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
      title: '样本ID',
      dataIndex: 'sampleId',
      key: 'sampleId',
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
            onClick={() => handleDownload(record.id)}
          >
            下载
          </Button>
          <Button
            type="link"
            icon={<LinkOutlined />}
            onClick={() => handleGetPresignedUrl(record.id)}
          >
            获取URL
          </Button>
          <Popconfirm title="确定要删除吗？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Row gutter={16} style={{ width: '100%' }}>
          <Col span={8}>
            <Form.Item name="fileName" label="文件名">
              <Input placeholder="请输入文件名" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="sampleId" label="样本ID">
              <Input placeholder="请输入样本ID" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="dateRange" label="日期范围">
              <DatePicker.RangePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Row>
          <Col span={24} style={{ textAlign: 'right' }}>
            <Space>
              <Button type="primary" onClick={handleSearch}>
                搜索
              </Button>
              <Button onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Col>
        </Row>
      </Form>

      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>
          刷新
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey="id"
        pagination={{
          current: pageNum,
          pageSize,
          total,
          onChange: (page, size) => {
            setPageNum(page)
            setPageSize(size)
          },
        }}
      />
    </div>
  )
}

export default AttachmentList
