import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Popconfirm, message, Modal, Form, Input, Select, Switch } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { getRules, createRule, updateRule, deleteRule } from '../../api/validation'
import { ValidationRule } from '../../types'

const ValidationRules: React.FC = () => {
  const [data, setData] = useState<ValidationRule[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [currentRule, setCurrentRule] = useState<ValidationRule | null>(null)
  const [form] = Form.useForm()

  const fetchData = async () => {
    setLoading(true)
    try {
      const response = await getRules()
      setData(response.data)
    } catch (error) {
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAdd = () => {
    setCurrentRule(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: ValidationRule) => {
    setCurrentRule(record)
    form.setFieldsValue(record)
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteRule(id)
      message.success('删除成功')
      fetchData()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleToggleEnable = async (record: ValidationRule) => {
    try {
      await updateRule(record.id!, { ...record, enabled: !record.enabled })
      message.success(record.enabled ? '已禁用' : '已启用')
      fetchData()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (currentRule?.id) {
        await updateRule(currentRule.id, values)
        message.success('更新成功')
      } else {
        await createRule(values)
        message.success('创建成功')
      }
      setModalVisible(false)
      fetchData()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const columns = [
    {
      title: '规则编码',
      dataIndex: 'fieldName',
      key: 'fieldName',
    },
    {
      title: '规则名称',
      dataIndex: 'ruleType',
      key: 'ruleType',
    },
    {
      title: '字段名',
      dataIndex: 'fieldName',
      key: 'fieldName',
    },
    {
      title: '规则类型',
      dataIndex: 'ruleType',
      key: 'ruleType',
    },
    {
      title: '是否启用',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (text: boolean, record: ValidationRule) => (
        <Switch checked={text} onChange={() => handleToggleEnable(record)} />
      ),
    },
    {
      title: '错误提示',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: ValidationRule) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
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

  return (
    <div>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增规则
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey="id"
        pagination={{
          pageSize: 10,
        }}
      />

      <Modal
        title={currentRule ? '编辑规则' : '新增规则'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="fieldName"
            label="规则编码"
            rules={[{ required: true, message: '请输入规则编码' }]}
          >
            <Input placeholder="请输入规则编码" />
          </Form.Item>
          <Form.Item
            name="ruleType"
            label="规则名称"
            rules={[{ required: true, message: '请输入规则名称' }]}
          >
            <Input placeholder="请输入规则名称" />
          </Form.Item>
          <Form.Item
            name="fieldName"
            label="字段名"
            rules={[{ required: true, message: '请输入字段名' }]}
          >
            <Input placeholder="请输入字段名" />
          </Form.Item>
          <Form.Item
            name="ruleType"
            label="规则类型"
            rules={[{ required: true, message: '请选择规则类型' }]}
          >
            <Select placeholder="请选择规则类型">
              <Select.Option value="NOT_NULL">NOT_NULL</Select.Option>
              <Select.Option value="RANGE">RANGE</Select.Option>
              <Select.Option value="REGEX">REGEX</Select.Option>
              <Select.Option value="ENUM">ENUM</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="ruleValue" label="规则表达式">
            <Input.TextArea rows={3} placeholder="请输入规则表达式" />
          </Form.Item>
          <Form.Item
            name="errorMessage"
            label="错误提示"
            rules={[{ required: true, message: '请输入错误提示' }]}
          >
            <Input placeholder="请输入错误提示" />
          </Form.Item>
          <Form.Item name="enabled" label="是否启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ValidationRules
