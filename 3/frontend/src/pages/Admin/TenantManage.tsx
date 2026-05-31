import React, { useState } from 'react'
import { Table, Button, Space, Popconfirm, message, Modal, Form, Input, Select, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { formatDate } from '../../utils/format'

interface Tenant {
  id: number
  name: string
  status: string
  createdAt: string
}

const TenantManage: React.FC = () => {
  const [data, setData] = useState<Tenant[]>([
    { id: 1, name: '租户A', status: 'ACTIVE', createdAt: '2024-01-01 10:00:00' },
    { id: 2, name: '租户B', status: 'ACTIVE', createdAt: '2024-02-15 14:30:00' },
    { id: 3, name: '租户C', status: 'INACTIVE', createdAt: '2024-03-20 09:00:00' },
  ])
  const [modalVisible, setModalVisible] = useState(false)
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
  const [form] = Form.useForm()

  const handleAdd = () => {
    setCurrentTenant(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: Tenant) => {
    setCurrentTenant(record)
    form.setFieldsValue(record)
    setModalVisible(true)
  }

  const handleDelete = (id: number) => {
    setData((prev) => prev.filter((item) => item.id !== id))
    message.success('删除成功')
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (currentTenant?.id) {
        setData((prev) =>
          prev.map((item) => (item.id === currentTenant.id ? { ...item, ...values } : item))
        )
        message.success('更新成功')
      } else {
        const newTenant: Tenant = {
          id: Date.now(),
          ...values,
          createdAt: new Date().toISOString(),
        }
        setData((prev) => [...prev, newTenant])
        message.success('创建成功')
      }
      setModalVisible(false)
    } catch (error) {
      message.error('操作失败')
    }
  }

  const columns = [
    {
      title: '租户名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (text: string) => (
        <Tag color={text === 'ACTIVE' ? 'green' : 'red'}>
          {text === 'ACTIVE' ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => formatDate(text),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Tenant) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
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
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增租户
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        pagination={{
          pageSize: 10,
        }}
      />

      <Modal
        title={currentTenant ? '编辑租户' : '新增租户'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="租户名称"
            rules={[{ required: true, message: '请输入租户名称' }]}
          >
            <Input placeholder="请输入租户名称" />
          </Form.Item>
          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
            initialValue="ACTIVE"
          >
            <Select placeholder="请选择状态">
              <Select.Option value="ACTIVE">启用</Select.Option>
              <Select.Option value="INACTIVE">禁用</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default TenantManage
