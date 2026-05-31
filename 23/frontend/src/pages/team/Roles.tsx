import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Tag, Popconfirm, message, Modal, Form, Input, Tree, Card } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined, SafetyOutlined } from '@ant-design/icons'
import { PageHeader } from '@/components'
import { teamApi } from '@/api'
import { Role, Permission } from '@/types'
import { formatDate } from '@/utils'

const TeamRoles: React.FC = () => {
  const [list, setList] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [permissionModalVisible, setPermissionModalVisible] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [checkedPermissions, setCheckedPermissions] = useState<number[]>([])
  const [form] = Form.useForm()

  const fetchList = async () => {
    setLoading(true)
    try {
      const res = await teamApi.getRoles()
      setList(res.data)
    } catch (error) {
      message.error('获取角色列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchPermissions = async () => {
    try {
      const res = await teamApi.getPermissions()
      setPermissions(res.data)
    } catch (error) {
      console.error('Failed to fetch permissions:', error)
    }
  }

  useEffect(() => {
    fetchList()
    fetchPermissions()
  }, [])

  const handleAdd = () => {
    setEditingRole(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: Role) => {
    setEditingRole(record)
    form.setFieldsValue({
      name: record.name,
      code: record.code,
      description: record.description
    })
    setModalVisible(true)
  }

  const handlePermission = async (record: Role) => {
    setSelectedRole(record)
    try {
      const res = await teamApi.getRolePermissions(record.id)
      setCheckedPermissions(res.data)
      setPermissionModalVisible(true)
    } catch (error) {
      message.error('获取权限失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await teamApi.deleteRole(id)
      message.success('删除成功')
      fetchList()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      if (editingRole) {
        await teamApi.updateRole(editingRole.id, values.name, values.code, values.description)
        message.success('更新成功')
      } else {
        await teamApi.createRole(values.name, values.code, values.description)
        message.success('创建成功')
      }
      setModalVisible(false)
      fetchList()
    } catch (error: any) {
      message.error(error.message || '操作失败')
    }
  }

  const handlePermissionSubmit = async () => {
    if (!selectedRole) return
    try {
      await teamApi.assignRolePermissions(selectedRole.id, checkedPermissions)
      message.success('权限分配成功')
      setPermissionModalVisible(false)
    } catch (error) {
      message.error('权限分配失败')
    }
  }

  const treeData = permissions.map((p) => ({
    title: p.name,
    key: p.id,
    children: p.children?.map((c: Permission) => ({
      title: c.name,
      key: c.id
    }))
  }))

  const columns = [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record: Role) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: '#722ed1',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <SafetyOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 500 }}>{name}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{record.code}</div>
          </div>
        </div>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true
    },
    {
      title: '权限数量',
      key: 'permissionCount',
      width: 120,
      render: (_: any, record: Role) => (
        <Tag color="purple">{record.permissions?.length || 0} 个</Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: number) => (
        <Tag color={status === 1 ? 'green' : 'red'}>
          {status === 1 ? '启用' : '禁用'}
        </Tag>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (time: string) => formatDate(time)
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: Role) => (
        <Space>
          <Button
            type="link"
            icon={<SettingOutlined />}
            onClick={() => handlePermission(record)}
          >
            权限
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该角色？"
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
        title="角色权限"
        subtitle="管理系统角色和权限"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            新增角色
          </Button>
        }
      />
      <Table
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        pagination={false}
      />
      <Modal
        title={editingRole ? '编辑角色' : '新增角色'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>
          <Form.Item
            name="code"
            label="角色编码"
            rules={[{ required: true, message: '请输入角色编码' }]}
          >
            <Input placeholder="请输入角色编码" />
          </Form.Item>
          <Form.Item
            name="description"
            label="角色描述"
          >
            <Input.TextArea rows={3} placeholder="请输入角色描述" />
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
      <Modal
        title={`分配权限 - ${selectedRole?.name}`}
        open={permissionModalVisible}
        onCancel={() => setPermissionModalVisible(false)}
        onOk={handlePermissionSubmit}
        width={600}
      >
        <Card title="权限列表" size="small">
          <Tree
            checkable
            checkedKeys={checkedPermissions}
            onCheck={(keys) => setCheckedPermissions(keys as number[])}
            treeData={treeData}
            defaultExpandAll
          />
        </Card>
      </Modal>
    </div>
  )
}

export default TeamRoles
