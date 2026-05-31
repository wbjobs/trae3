import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Table, Form, Input, Select, DatePicker, Button, Space, Popconfirm, message, Row, Col } from 'antd'
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, PaperClipOutlined, CheckCircleOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons'
import { querySamples, deleteSample, PageResult } from '../../api/sample'
import { exportSamples } from '../../api/batch'
import { SampleMetadata, SampleQueryRequest } from '../../types'
import { formatDate } from '../../utils/format'
import dayjs from 'dayjs'
import SampleForm from './SampleForm'
import SampleDetail from './SampleDetail'
import BatchImportModal from '../../components/BatchImportModal'

const { Option } = Select

const SampleList: React.FC = () => {
  const [form] = Form.useForm()
  const [data, setData] = useState<SampleMetadata[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [pageNum, setPageNum] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [formVisible, setFormVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [importVisible, setImportVisible] = useState(false)
  const [currentSample, setCurrentSample] = useState<SampleMetadata | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const values = form.getFieldsValue()
      const params: SampleQueryRequest = {
        sampleCode: values.sampleCode,
        sampleType: values.sampleType,
        status: values.status,
        collectionDateStart: values.dateRange?.[0]?.format('YYYY-MM-DD'),
        collectionDateEnd: values.dateRange?.[1]?.format('YYYY-MM-DD'),
        page: pageNum,
        size: pageSize,
      }
      const response = await querySamples(params)
      if (response.code === 200) {
        setData(response.data.content)
        setTotal(response.data.totalElements)
      } else {
        message.error(response.message || '获取数据失败')
      }
    } catch (error) {
      console.error('Fetch error:', error)
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [form, pageNum, pageSize])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSearch = useCallback(() => {
    setPageNum(0)
    fetchData()
  }, [fetchData])

  const handleReset = useCallback(() => {
    form.resetFields()
    setPageNum(0)
    fetchData()
  }, [form, fetchData])

  const handleAdd = useCallback(() => {
    setCurrentSample(null)
    setFormVisible(true)
  }, [])

  const handleEdit = useCallback((record: SampleMetadata) => {
    setCurrentSample(record)
    setFormVisible(true)
  }, [])

  const handleDelete = useCallback(async (id: number) => {
    try {
      const response = await deleteSample(id)
      if (response.code === 200) {
        message.success('删除成功')
        fetchData()
      } else {
        message.error(response.message || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }, [fetchData])

  const handleViewAttachments = useCallback((record: SampleMetadata) => {
    setCurrentSample(record)
    setDetailVisible(true)
  }, [])

  const handleValidate = useCallback((record: SampleMetadata) => {
    message.success('验证功能已集成到保存流程')
  }, [])

  const handleImport = useCallback(() => {
    setImportVisible(true)
  }, [])

  const handleImportSuccess = useCallback(() => {
    setImportVisible(false)
    fetchData()
  }, [fetchData])

  const handleExport = useCallback(() => {
    const values = form.getFieldsValue()
    const params = {
      sampleCode: values.sampleCode,
      sampleType: values.sampleType,
      status: values.status,
      collectionDateStart: values.dateRange?.[0]?.format('YYYY-MM-DD'),
      collectionDateEnd: values.dateRange?.[1]?.format('YYYY-MM-DD'),
    }
    exportSamples(params)
  }, [form])

  const columns = useMemo(() => [
    {
      title: '样本编号',
      dataIndex: 'sampleCode',
      key: 'sampleCode',
      width: 150,
    },
    {
      title: '样本名称',
      dataIndex: 'sampleName',
      key: 'sampleName',
      width: 150,
    },
    {
      title: '样本类型',
      dataIndex: 'sampleType',
      key: 'sampleType',
      width: 120,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      width: 120,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (text: string) => formatDate(text),
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right' as const,
      render: (_: any, record: SampleMetadata) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定要删除吗？" onConfirm={() => handleDelete(record.id!)}>
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button type="link" icon={<PaperClipOutlined />} onClick={() => handleViewAttachments(record)}>
            附件
          </Button>
          <Button type="link" icon={<CheckCircleOutlined />} onClick={() => handleValidate(record)}>
            验证
          </Button>
        </Space>
      ),
    },
  ], [handleEdit, handleDelete, handleViewAttachments, handleValidate])

  const handleScrollLoad = useCallback(async (currentPage: number, currentPageSize: number) => {
    if (currentPage * currentPageSize >= total) return
    
    setLoading(true)
    try {
      const values = form.getFieldsValue()
      const params: SampleQueryRequest = {
        sampleCode: values.sampleCode,
        sampleType: values.sampleType,
        status: values.status,
        collectionDateStart: values.dateRange?.[0]?.format('YYYY-MM-DD'),
        collectionDateEnd: values.dateRange?.[1]?.format('YYYY-MM-DD'),
        page: currentPage,
        size: currentPageSize,
      }
      const response = await querySamples(params)
      if (response.code === 200) {
        setData(prevData => [...prevData, ...response.data.content])
      }
    } catch (error) {
      console.error('Fetch error:', error)
    } finally {
      setLoading(false)
    }
  }, [form, total])

  return (
    <div>
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
        <Row gutter={16} style={{ width: '100%' }}>
          <Col span={6}>
            <Form.Item name="sampleCode" label="样本编号">
              <Input placeholder="请输入样本编号" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="sampleType" label="样本类型">
              <Select placeholder="请选择样本类型" allowClear>
                <Option value="BLOOD">血液</Option>
                <Option value="TISSUE">组织</Option>
                <Option value="FLUID">体液</Option>
                <Option value="OTHER">其他</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="status" label="状态">
              <Select placeholder="请选择状态" allowClear>
                <Option value="ACTIVE">活跃</Option>
                <Option value="DRAFT">草稿</Option>
                <Option value="DELETED">已删除</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="dateRange" label="采集日期">
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
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增样本
          </Button>
          <Button icon={<ImportOutlined />} onClick={handleImport}>
            批量导入
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            批量导出
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            刷新
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey="id"
        scroll={{ x: 1200, y: 600 }}
        virtual
        pagination={{
          current: pageNum + 1,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100', '200'],
          onChange: (page, size) => {
            setPageNum(page - 1)
            setPageSize(size)
          },
          onShowSizeChange: (current, size) => {
            setPageNum(0)
            setPageSize(size)
          },
        }}
      />

      <SampleForm
        visible={formVisible}
        sample={currentSample}
        onCancel={() => setFormVisible(false)}
        onSuccess={() => {
          setFormVisible(false)
          fetchData()
        }}
      />

      <SampleDetail
        visible={detailVisible}
        sample={currentSample}
        onCancel={() => setDetailVisible(false)}
        onSuccess={fetchData}
      />

      <BatchImportModal
        visible={importVisible}
        onCancel={() => setImportVisible(false)}
        onSuccess={handleImportSuccess}
      />
    </div>
  )
}

export default SampleList
