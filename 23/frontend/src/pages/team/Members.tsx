import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Tag, Popconfirm, message, Modal, Form, Select } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { PageHeader } from '@/components'
import { teamApi } from '@/api'
import { TeamMember, Role } from '@/types'
import { formatDate } from '@/utils'

const TeamMembers: React.FC = () => {
  const [list, setList] = useState<TeamMember[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [form] = Form.useForm()
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })

  const fetchList = async () => {
    setLoading(true)
    try {
      const res = await teamApi.getMembers(pagination.current, pagination.pageSize)
      setList(res.data.list)
      setPagination((prev) => ({
        ...prev,
        total: res.data.total
      }))
    } catch (error) {
      message.error('获取成员列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchRoles = async () => {
    try {
      const res = await teamApi.getRoles()
      setRoles(res.data)
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    }
  }

  useEffect(() => {
    fetchList()
    fetchRoles()
  }, [pagination.current, pagination.pageSize])

  const handleAdd = () => {
    setEditingMember(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: TeamMember) => {
    setEditingMember(record)
    form.setFieldsValue({
      roleId: record.roleId
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await teamApi.removeMember(id)
      message.success('删除成功')
      fetchList()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      if (editingMember) {
        await teamApi.updateMemberRole(editingMember.id, values.roleId)
        message.success('更新成功')
      } else {
        await teamApi.addMember(values.userId, values.roleId)
        message.success('添加成功')
      }
      setModalVisible(false)
      fetchList()
    } catch (error: any) {
      message.error(error.message || '操作失败')
    }
  }

  const columns = [
    {
      title: '成员',
      key: 'member',
      width: 200,
      render: (_: any, record: TeamMember) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#1890ff',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600
            }}
          >
            {record.nickname?.charAt(0) || record.username?.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 500 }}>{record.nickname || record.username}</div>
            <div style={{ fontSize: 12, color: '#999' }}>@{record.username}</div>
          </div>
        </div>
      )
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone'
    },
    {
      title: '角色',
      dataIndex: 'roleName',
      key: 'roleName',
      render: (roleName: string) => <Tag color="blue">{roleName}</Tag>
    },
    {
      title: '加入时间',
      dataIndex: 'joinTime',
      key: 'joinTime',
      render: (time: string) => formatDate(time)
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: number) => (
        <Tag color={status === 1 ? 'green' : 'red'}>
          {status === 1 ? '正常' : '禁用'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: TeamMember) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定移除该成员？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              移除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <PageHeader
        title="成员管理"
        subtitle="管理团队成员"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            添加成员
          </Button>
        }
      />
      <Table
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 人`
        }}
      />
      <Modal
        title={editingMember ? '编辑成员' : '添加成员'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          {!editingMember && (
            <Form.Item
              name="userId"
              label="选择用户"
              rules={[{ required: true, message: '请选择用户' }]}
            >
              <Select
                placeholder="请选择用户"
                showSearch
                optionFilterProp="children"
              >
              </Select>
            </Form.Item>
          )}
          <Form.Item
            name="roleId"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色">
              {roles.map((role) => (
                <Select.Option key={role.id} value={role.id}>
                  {role.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item>
            <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={() => setModalVisible(false)}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                确定
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default TeamMembers
