import { useState } from 'react'
import { Form, Input, Button, Card, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { login as loginApi } from '../api/auth'
import { useAuthStore } from '../store/authStore'
import { User } from '../types'

const Login = () => {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const loginStore = useAuthStore((state) => state.login)

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const response = await loginApi(values.username, values.password)
      if (response.code === 200) {
        const data = response.data
        const user: User = {
          id: data.userId,
          username: data.username,
          realName: data.realName,
          email: '',
          phone: '',
          tenantId: data.tenantId,
          department: '',
          status: 'ACTIVE',
          roles: data.roles || [],
        }
        loginStore(user, data.token)
        message.success('登录成功')
        navigate('/samples')
      } else {
        message.error(response.message || '登录失败')
      }
    } catch (error) {
      console.error('Login error:', error)
      message.error('登录失败，请检查用户名和密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card
        style={{
          width: 400,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
        title={
          <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 'bold' }}>
            样本管理系统
          </div>
        }
      >
        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名!' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码!' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              style={{ width: '100%' }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default Login
