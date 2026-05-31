import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Tag, Popconfirm, message, Input, Form, DatePicker, Select, Row, Col, Dropdown } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PictureOutlined, ExportOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { PageHeader, SearchForm } from '@/components'
import { specimenApi, annotationApi } from '@/api'
import { Specimen, SPECIMEN_TYPE_MAP, SPECIMEN_TYPE_OPTIONS } from '@/types'
import { formatDate } from '@/utils'

const SpecimenList: React.FC = () => {
  const navigate = useNavigate()
  const [list, setList] = useState<Specimen[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [exporting, setExporting] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })

  const fetchList = async (params?: any) => {
    setLoading(true)
    try {
      const res = await specimenApi.getList({
        page: pagination.current,
        size: pagination.pageSize,
        ...params
      })
      setList(res.data?.records || res.data?.list || [])
      setPagination(prev => ({
        ...prev,
        total: res.data?.total || 0
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
    setPagination(prev => ({ ...prev, current: 1 }))
    const params: any = {}
    if (values.keyword) params.keyword = values.keyword
    if (values.type) params.type = values.type
    if (values.status) params.status = values.status
    if (values.collector) params.collector = values.collector
    if (values.tag) params.tag = values.tag
    if (values.collectTime?.[0]) params.startTime = values.collectTime[0].toISOString()
    if (values.collectTime?.[1]) params.endTime = values.collectTime[1].toISOString()
    fetchList(params)
  }

  const handleDelete = async (id: number) => {
    try {
      await specimenApi.delete(id)
      message.success('删除成功')
      fetchList()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleExport = async (format: string) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要导出的标本')
      return
    }
    setExporting(true)
    try {
      const res: any = await annotationApi.exportAnnotations(
        selectedRowKeys.map(key => Number(key)),
        format
      )
      const blob = new Blob([res], {
        type: format === 'coco' ? 'application/json' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = format === 'coco' ? '标本标注COCO.json' : '标本标注数据.xlsx'
      link.click()
      window.URL.revokeObjectURL(url)
      message.success(`导出成功，共导出 ${selectedRowKeys.length} 个标本的标注数据`)
    } catch (error) {
      message.error('导出失败')
    } finally {
      setExporting(false)
    }
  }

  const columns = [
    {
      title: '标本名称',
      dataIndex: 'name',
      key: 'name',
      width: 180
    },
    {
      title: '标本编号',
      dataIndex: 'specimenNo',
      key: 'specimenNo',
      width: 130
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: number, record: Specimen) => (
        <Tag color="blue">{record.typeName || SPECIMEN_TYPE_MAP[type] || '未知'}</Tag>
      )
    },
    {
      title: '分类学名',
      dataIndex: 'classification',
      key: 'classification',
      width: 160,
      ellipsis: true
    },
    {
      title: '采集地点',
      dataIndex: 'location',
      key: 'location',
      width: 150,
      ellipsis: true
    },
    {
      title: '采集人',
      dataIndex: 'collector',
      key: 'collector',
      width: 100
    },
    {
      title: '采集时间',
      dataIndex: 'collectTime',
      key: 'collectTime',
      width: 160,
      render: (time: string) => formatDate(time)
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: number) => (
        <Tag color={status === 1 ? 'green' : 'orange'}>
          {status === 1 ? '正常' : '停用'}
        </Tag>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      render: (time: string) => formatDate(time)
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: Specimen) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/specimen/detail/${record.id}`)}
          >
            详情
          </Button>
          <Button
            type="link"
            icon={<PictureOutlined />}
            onClick={() => navigate(`/annotation?specimenId=${record.id}`)}
          >
            标注
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => navigate(`/specimen/edit/${record.id}`)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该标本？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <PageHeader
        title="标本列表"
        subtitle="管理所有标本数据"
        extra={
          <Space>
            <Dropdown
              menu={{
                items: [
                  { key: 'excel', label: '导出 Excel' },
                  { key: 'coco', label: '导出 COCO JSON' }
                ],
                onClick: ({ key }) => handleExport(key)
              }}
            >
              <Button icon={<ExportOutlined />} loading={exporting} disabled={selectedRowKeys.length === 0}>
                批量导出标注 {selectedRowKeys.length > 0 ? `(${selectedRowKeys.length})` : ''}
              </Button>
            </Dropdown>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/specimen/create')}
            >
              新增标本
            </Button>
          </Space>
        }
      />
      <SearchForm onSearch={handleSearch}>
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item name="keyword" label="关键词">
              <Input placeholder="名称/编号/分类" allowClear />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="type" label="标本类型">
              <Select placeholder="请选择类型" allowClear options={SPECIMEN_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="collector" label="采集人">
              <Input placeholder="请输入采集人" allowClear />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="status" label="状态">
              <Select placeholder="请选择状态" allowClear>
                <Select.Option value={1}>正常</Select.Option>
                <Select.Option value={0}>停用</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="tag" label="标签">
              <Input placeholder="请输入标签关键词" allowClear />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="collectTime" label="采集时间">
              <DatePicker.RangePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      </SearchForm>
      <Table
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys
        }}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: total => `共 ${total} 条`
        }}
        onChange={(pag) => {
          setPagination(prev => ({
            ...prev,
            current: pag.current || 1,
            pageSize: pag.pageSize || 10
          }))
        }}
        scroll={{ x: 1500 }}
      />
    </div>
  )
}

export default SpecimenList
