import React, { useState } from 'react'
import { Form, Input, Select, Button, Table, Card, Space, message, Row, Col, Statistic } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { crossDeptQuery } from '../../api/sample'
import { SampleMetadata } from '../../types'
import { formatDate } from '../../utils/format'

const CrossDeptQuery: React.FC = () => {
  const [form] = Form.useForm()
  const [data, setData] = useState<SampleMetadata[]>([])
  const [loading, setLoading] = useState(false)
  const [queryCount, setQueryCount] = useState(0)
  const [lastQueryTime, setLastQueryTime] = useState<string>('-')
  const [total, setTotal] = useState(0)
  const [pageNum, setPageNum] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const handleQuery = async () => {
    setLoading(true)
    try {
      const values = await form.validateFields()
      const params = {
        sampleCode: values.sampleCode,
        sampleName: values.sampleName,
        sampleType: values.sampleType,
        page: pageNum,
        size: pageSize,
      }
      const response = await crossDeptQuery(params, values.targetTenant)
      if (response.code === 200) {
        setData(response.data.content)
        setTotal(response.data.totalElements)
        setQueryCount((prev) => prev + 1)
        setLastQueryTime(formatDate(new Date()))
        message.success('查询成功')
      } else {
        message.error(response.message || '查询失败')
      }
    } catch (error) {
      console.error('Query error:', error)
      message.error('查询失败')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    form.resetFields()
    setData([])
    setTotal(0)
  }

  const columns = [
    {
      title: '样本编号',
      dataIndex: 'sampleCode',
      key: 'sampleCode',
    },
    {
      title: '样本名称',
      dataIndex: 'sampleName',
      key: 'sampleName',
    },
    {
      title: '样本类型',
      dataIndex: 'sampleType',
      key: 'sampleType',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => formatDate(text),
    },
  ]

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card>
            <Statistic title="已执行查询次数" value={queryCount} />
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <Statistic title="最后查询时间" value={lastQueryTime} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="targetTenant" label="目标租户" rules={[{ required: true, message: '请选择目标租户' }]}>
                <Select placeholder="请选择目标租户">
                  <Select.Option value={1}>租户A</Select.Option>
                  <Select.Option value={2}>租户B</Select.Option>
                  <Select.Option value={3}>租户C</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="sampleCode" label="样本编号">
                <Input placeholder="请输入样本编号" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="sampleName" label="样本名称">
                <Input placeholder="请输入样本名称" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="sampleType" label="样本类型">
                <Select placeholder="请选择样本类型" allowClear>
                  <Select.Option value="BLOOD">血液</Select.Option>
                  <Select.Option value="TISSUE">组织</Select.Option>
                  <Select.Option value="FLUID">体液</Select.Option>
                  <Select.Option value="OTHER">其他</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row>
            <Col span={24} style={{ textAlign: 'right' }}>
              <Space>
                <Button type="primary" icon={<SearchOutlined />} onClick={handleQuery} loading={loading}>
                  查询
                </Button>
                <Button onClick={handleReset}>
                  重置
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Card>

      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey="id"
        pagination={{
          current: pageNum + 1,
          pageSize,
          total,
          onChange: (page, size) => {
            setPageNum(page - 1)
            setPageSize(size)
            handleQuery()
          },
        }}
      />
    </div>
  )
}

export default CrossDeptQuery
