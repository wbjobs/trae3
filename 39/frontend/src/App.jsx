import { useState, useEffect } from 'react'
import { Modal, Input, Button, message } from 'antd'
import { 
  GlobalOutlined, 
  WifiOutlined, 
  WifiOffOutlined 
} from '@ant-design/icons'
import ThreeScene from './components/ThreeScene'
import DevicePanel from './components/DevicePanel'
import AlarmPanel from './components/AlarmPanel'
import CollaborationPanel from './components/CollaborationPanel'
import StatsPanel from './components/StatsPanel'
import useStore from './store/useStore'
import socketService from './services/socket'
import { v4 as uuidv4 } from 'uuid'

export default function App() {
  const [showLogin, setShowLogin] = useState(true)
  const [userName, setUserName] = useState('')
  const isConnected = useStore(state => state.isConnected)
  
  const handleLogin = async () => {
    if (!userName.trim()) {
      message.warning('请输入用户名')
      return
    }
    
    const userId = uuidv4()
    
    try {
      await socketService.connect(userId, userName.trim())
      setShowLogin(false)
      message.success(`欢迎, ${userName}!`)
    } catch (error) {
      message.error('连接服务器失败')
    }
  }

  useEffect(() => {
    return () => {
      socketService.disconnect()
    }
  }, [])

  return (
    <div className="app-container">
      <Modal
        title="工业产线数字孪生系统"
        open={showLogin}
        closable={false}
        footer={[
          <Button 
            key="submit" 
            type="primary" 
            onClick={handleLogin}
            size="large"
            style={{ width: '100%' }}
          >
            进入系统
          </Button>
        ]}
        centered
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <GlobalOutlined style={{ fontSize: '64px', color: '#1890ff', marginBottom: '16px' }} />
          <p style={{ color: 'rgba(0,0,0,0.65)' }}>请输入您的姓名进入协同运维系统</p>
        </div>
        <Input
          size="large"
          placeholder="请输入用户名"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          onPressEnter={handleLogin}
          prefix={<span style={{ color: 'rgba(0,0,0,0.45)' }}>👤</span>}
        />
      </Modal>

      <header className="header">
        <div className="header-title">
          <GlobalOutlined />
          工业产线数字孪生协同运维系统
        </div>
        <div className="header-status">
          <span>
            {isConnected ? (
              <span className="status-online"><WifiOutlined /> 已连接</span>
            ) : (
              <span className="status-offline"><WifiOffOutlined /> 断开连接</span>
            )}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>
            {new Date().toLocaleString('zh-CN')}
          </span>
        </div>
      </header>

      <div className="main-layout">
        <div className="scene-container">
          <ThreeScene />
        </div>
        
        <div className="sidebar">
          <div className="sidebar-content">
            <CollaborationPanel />
            <StatsPanel />
            <DevicePanel />
            <AlarmPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
