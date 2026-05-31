import React, { useEffect } from 'react'
import { Form, Input, Button, Select, Tabs, message } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined, BankOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks'
import { Tenant } from '@/types'

const Register: React.FC = () => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { register, fetchTenants, tenants } = useAuth()

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  const handleSubmit = async (values: any) => {
    try {
      await register(values)
      message.success('注册成功')
    } catch (error: any) {
      message.error(error.message || '注册失败')
    }
  }

  return (
    <div>
      <Tabs
        centered
        items={[
          {
            key: 'register',
            label: '注册'
          }
        ]}
      />
      <Form
        form={form}
        name="register"
        onFinish={handleSubmit}
        size="large"
        layout="vertical"
      >
        <Form.Item
          name="tenantId"
          label="选择租户"
          rules={[{ required: true, message: '请选择租户' }]}
        >
          <Select
            placeholder="请选择租户"
            prefix={<BankOutlined />}
            options={tenants.map((t: Tenant) => ({
              label: t.name,
              value: t.id
            }))}
          />
        </Form.Item>
        <Form.Item
          name="username"
          rules={[{ required: true, message: '请输入用户名' }]}
        >
          <Input
            prefix={<UserOutlined />}
            placeholder="用户名"
          />
        </Form.Item>
        <Form.Item
          name="nickname"
          rules={[{ required: true, message: '请输入昵称' }]}
        >
          <Input
            prefix={<UserOutlined />}
            placeholder="昵称"
          />
        </Form.Item>
        <Form.Item
          name="email"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '请输入有效的邮箱地址' }
          ]}
        >
          <Input
            prefix={<MailOutlined />}
            placeholder="邮箱"
          />
        </Form.Item>
        <Form.Item
          name="phone"
          rules={[{ required: true, message: '请输入手机号' }]}
        >
          <Input
            prefix={<PhoneOutlined />}
            placeholder="手机号"
          />
        </Form.Item>
        <Form.Item
          name="password"
          rules={[
            { required: true, message: '请输入密码' },
            { min: 6, message: '密码至少6位' }
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="密码"
          />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          dependencies={['password']}
          rules={[
            { required: true, message: '请确认密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('两次输入的密码不一致'))
              }
            })
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="确认密码"
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" block>
            注册
          </Button>
        </Form.Item>
        <div style={{ textAlign: 'center' }}>
          已有账号？
          <a onClick={() => navigate('/login')}>立即登录</a>
        </div>
      </Form>
    </div>
  )
}

export default Register
