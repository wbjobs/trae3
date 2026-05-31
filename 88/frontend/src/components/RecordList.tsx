import React, { useState, useEffect } from 'react'
import {
  Table,
  Input,
  Button,
  Space,
  Tag,
  Modal,
  Descriptions,
  Popconfirm,
  message,
  Card,
  Statistic,
  Row,
  Col
} from 'antd'
import {
  SearchOutlined,
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  BarChartOutlined
} from '@ant-design/icons'
import type { NameplateRecord, StatisticsResponse } from '../types'
import { FieldLabels } from '../types'
import { recordsApi } from '../services/api'
import dayjs from 'dayjs'

const RecordList: React.FC = () => {
  const [records, setRecords] = useState<NameplateRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [detailVisible, setDetailVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<NameplateRecord | null>(null)
  const [statistics, setStatistics] = useState<StatisticsResponse | null>(null)

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const response = await recordsApi.list({
        page,
        page_size: pageSize,
        keyword: keyword || undefined
      })
      setRecords(response.data.records)
      setTotal(response.data.total)
    } catch (error) {
      message.error('获取记录失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchStatistics = async () => {
    try {
      const response = await recordsApi.statistics()
      setStatistics(response.data)
    } catch (error) {
      console.error('获取统计数据失败')
    }
  }

  useEffect(() => {
    fetchRecords()
    fetchStatistics()
  }, [page, pageSize])

  const handleSearch = () => {
    setPage(1)
    fetchRecords()
  }

  const handleViewDetail = (record: NameplateRecord) => {
    setSelectedRecord(record)
    setDetailVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await recordsApi.delete(id)
      message.success('删除成功')
      fetchRecords()
      fetchStatistics()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleRefresh = () => {
    fetchRecords()
    fetchStatistics()
  }

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      completed: { color: 'success', text: '已完成' },
      pending: { color: 'warning', text: '待处理' },
      failed: { color: 'error', text: '失败' }
    }
    const info = statusMap[status] || { color: 'default', text: status }
    return <Tag color={info.color}>{info.text}</Tag>
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return '#52c41a'
    if (confidence >= 0.7) return '#faad14'
    return '#ff4d4f'
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60
    },
    {
      title: '设备名称',
      dataIndex: 'equipment_name',
      key: 'equipment_name',
      ellipsis: true
    },
    {
      title: '型号规格',
      dataIndex: 'equipment_model',
      key: 'equipment_model',
      ellipsis: true
    },
    {
      title: '出厂编号',
      dataIndex: 'serial_number',
      key: 'serial_number',
      ellipsis: true
    },
    {
      title: '制造厂家',
      dataIndex: 'manufacturer',
      key: 'manufacturer',
      ellipsis: true
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 100,
      render: (confidence: number) => (
        <span style={{ color: getConfidenceColor(confidence), fontWeight: 'bold' }}>
          {(confidence * 100).toFixed(1)}%
        </span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => getStatusTag(status)
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: any, record: NameplateRecord) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            size="small"
            onClick={() => handleViewDetail(record)}
          >
            查看
          </Button>
          <Popconfirm
            title="确定删除此记录？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      {statistics && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="总记录数"
                value={statistics.total_records}
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="已完成"
                value={statistics.completed_records}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="待处理"
                value={statistics.pending_records}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="平均置信度"
                value={(statistics.average_confidence * 100).toFixed(1)}
                suffix="%"
                valueStyle={{ color: '#1677ff' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card
        title="档案记录"
        extra={
          <Space>
            <Input
              placeholder="搜索设备名称、型号、编号等"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 250 }}
              prefix={<SearchOutlined />}
              allowClear
            />
            <Button icon={<SearchOutlined />} onClick={handleSearch}>
              搜索
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
              刷新
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={records}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            }
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title="记录详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={700}
      >
        {selectedRecord && (
          <div>
            <Descriptions
              bordered
              column={1}
              size="small"
              items={Object.entries(FieldLabels)
                .filter(([key]) => selectedRecord[key as keyof typeof selectedRecord])
                .map(([key, label]) => ({
                  key,
                  label,
                  children: selectedRecord[key as keyof typeof selectedRecord]
                }))}
            />
            <Descriptions
              bordered
              column={2}
              size="small"
              style={{ marginTop: 16 }}
              items={[
                {
                  key: 'filename',
                  label: '文件名',
                  children: selectedRecord.filename
                },
                {
                  key: 'confidence',
                  label: '置信度',
                  children: `${(selectedRecord.confidence * 100).toFixed(1)}%`
                },
                {
                  key: 'status',
                  label: '状态',
                  children: getStatusTag(selectedRecord.status)
                },
                {
                  key: 'created_at',
                  label: '创建时间',
                  children: dayjs(selectedRecord.created_at).format('YYYY-MM-DD HH:mm:ss')
                }
              ]}
            />
            {selectedRecord.raw_text && (
              <div style={{ marginTop: 16 }}>
                <h4>原始文本</h4>
                <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
                  {selectedRecord.raw_text}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default RecordList
