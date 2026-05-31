import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Tag, message, Input, Form, Select, DatePicker } from 'antd'
import { PlusOutlined, QrcodeOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { PageHeader, SearchForm } from '@/components'
import { traceabilityApi } from '@/api'
import { TraceabilityRecord } from '@/types'
import { formatDate } from '@/utils'

const operationTypeMap: Record<number, { color: string; label: string }> = {
  1: { color: 'blue', label: '创建' },
  2: { color: 'gold', label: '更新' },
  3: { color: 'cyan', label: '提交' },
  4: { color: 'green', label: '审核' },
  5: { color: 'red', label: '驳回' },
  6: { color: 'purple', label: '归档' },
  7: { color: 'orange', label: '导出' },
  8: { color: 'geekblue', label: '导入' }
}

const TraceabilityList: React.FC = () => {
  const navigate = useNavigate()
  const [list, setList] = useState<TraceabilityRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })

  const fetchList = async (params?: any) => {
    setLoading(true)
    try {
      const res = await traceabilityApi.getRecords({
        pageNum: pagination.current,
        pageSize: pagination.pageSize,
        ...params
      })
      setList(res.data.list || res.data.records || [])
      setPagination((prev) => ({
        ...prev,
        total: res.data.total || 0
      }))
    } catch (error) {
      message.error('获取列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [pagination.current, pagination.pageSize])

  const handleSearch = (values: any) => {
    setPagination((prev) => ({ ...prev, current: 1 }))
    fetchList(values)
  }

  const handleGenerateQrCode = async (specimenId: number) => {
    try {
      await traceabilityApi.generateQrCode(specimenId)
      message.success('二维码生成成功')
    } catch (error) {
      message.error('二维码生成失败')
    }
  }

  const columns = [
    {
      title: '操作类型',
      dataIndex: 'operationType',
      key: 'operationType',
      width: 120,
      render: (type: number) => {
        const info = operationTypeMap[type] || { color: 'default', label: type }
        return <Tag color={info.color}>{info.label}</Tag>
      }
    },
    {
      title: '操作描述',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 120
    },
    {
      title: '地点',
      dataIndex: 'location',
      key: 'location',
      width: 150
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark2',
      ellipsis: true
    },
    {
      title: '操作时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (time: string) => formatDate(time)
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: TraceabilityRecord) => (
        <Space>
          <Button
            type="link"
            icon={<QrcodeOutlined />}
            onClick={() => handleGenerateQrCode(record.specimenId)}
          >
            生成二维码
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div>
      <PageHeader
        title="溯源信息"
        subtitle="管理溯源记录"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/traceability/chain')}
          >
            查看溯源链
          </Button>
        }
      />
      <SearchForm onSearch={handleSearch}>
        <Form.Item name="operationType" label="操作类型">
          <Select placeholder="请选择操作类型" allowClear>
            {Object.entries(operationTypeMap).map(([key, value]) => (
              <Select.Option key={key} value={Number(key)}>
                {value.label}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="operator" label="操作人">
          <Input placeholder="请输入操作人" />
        </Form.Item>
        <Form.Item name="createTime" label="操作时间">
          <DatePicker.RangePicker style={{ width: '100%' }} />
        </Form.Item>
      </SearchForm>
      <Table
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`
        }}
      />
    </div>
  )
}

export default TraceabilityList
