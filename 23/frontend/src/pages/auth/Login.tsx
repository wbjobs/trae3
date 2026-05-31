import React, { useEffect } from 'react'
import { Form, Input, Button, Select, Tabs, message } from 'antd'
import { UserOutlined, LockOutlined, BankOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks'
import { Tenant } from '@/types'

const Login: React.FC = () => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { login, fetchTenants, tenants } = useAuth()

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  const handleSubmit = async (values: any) => {
    try {
      await login(values)
      message.success('登录成功')
    } catch (error: any) {
      message.error(error.message || '登录失败')
    }
  }

  return (
    <div>
      <Tabs
        centered
        items={[
          {
            key: 'login',
            label: '登录'
          }
        ]}
      />
      <Form
        form={form}
        name="login"
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
            autoComplete="username"
          />
        </Form.Item>
        <Form.Item
          name="password"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="密码"
            autoComplete="current-password"
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form.Item>
        <div style={{ textAlign: 'center' }}>
          还没有账号？
          <a onClick={() => navigate('/register')}>立即注册</a>
        </div>
      </Form>
    </div>
  )
}

export default Login
