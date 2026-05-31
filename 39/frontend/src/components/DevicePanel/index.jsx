import { useState } from 'react'
import { Card, Button, Switch, Slider, Select, Row, Col, Statistic, Tag, Modal, message } from 'antd'
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  WarningOutlined,
  ToolOutlined,
  ReloadOutlined 
} from '@ant-design/icons'
import useStore from '../../store/useStore'
import socketService from '../../services/socket'
import dayjs from 'dayjs'

const { Option } = Select

export default function DevicePanel() {
  const [commandLoading, setCommandLoading] = useState(false)
  const devices = useStore(state => state.devices)
  const selectedDeviceId = useStore(state => state.selectedDevice)
  const selectedDevice = selectedDeviceId ? devices[selectedDeviceId] : null

  const statusColors = {
    running: { color: '#52c41a', text: '运行中' },
    stopped: { color: '#faad14', text: '已停止' },
    fault: { color: '#ff4d4f', text: '故障' },
    idle: { color: '#1890ff', text: '空闲' }
  }

  const handleCommand = async (command, params = {}) => {
    if (!selectedDeviceId) return
    
    setCommandLoading(true)
    socketService.sendCommand(selectedDeviceId, command, params)
    
    setTimeout(() => {
      setCommandLoading(false)
      message.success(`指令已下发: ${command}`)
    }, 500)
  }

  const handleSpeedChange = (value) => {
    handleCommand('setSpeed', { speed: value })
  }

  const handleModeChange = (value) => {
    handleCommand('setMode', { mode: value })
  }

  if (!selectedDevice) {
    return (
      <div style={{ 
        padding: '24px', 
        textAlign: 'center', 
        color: 'rgba(255,255,255,0.5)' 
      }}>
        <ToolOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
        <p>点击3D场景中的设备查看详情</p>
      </div>
    )
  }

  const status = statusColors[selectedDevice.status] || statusColors.idle

  return (
    <div className="device-info-panel">
      <div className="device-info-title">
        {selectedDevice.name}
        <Tag color={status.color} style={{ float: 'right' }}>
          {status.text}
        </Tag>
      </div>
      
      <div style={{ marginBottom: '16px' }}>
        <Row gutter={16}>
          <Col span={12}>
          <div className="device-param">
            <span>设备ID</span>
            <span className="device-param-value">{selectedDevice.id}</span>
          </div>
          <div className="device-param">
            <span>设备类型</span>
            <span className="device-param-value">{selectedDevice.type}</span>
          </div>
          <div className="device-param">
            <span>运行速度</span>
            <span className="device-param-value">{selectedDevice.speed}%</span>
          </div>
        </Row>
        
        <Row gutter={16} style={{ marginTop: '16px' }}>
          <Col span={12}>
            <Statistic 
              title="温度" 
              value={selectedDevice.temperature} 
              suffix="°C" 
              valueStyle={{ color: '#1890ff', fontSize: '20px' }}
            />
          </Col>
          <Col span={12}>
            <Statistic 
              title="运行时长" 
              value={selectedDevice.runtime} 
              suffix="h" 
              valueStyle={{ color: '#52c41a', fontSize: '20px' }}
            />
          </Col>
        </Row>
        <Row gutter={16} style={{ marginTop: '16px' }}>
          <Col span={12}>
            <Statistic 
              title="产出数量" 
              value={selectedDevice.output} 
              valueStyle={{ color: '#722ed1', fontSize: '20px' }}
            />
          </Col>
          <Col span={12}>
            <Statistic 
              title="能耗" 
              value={selectedDevice.energy} 
              suffix="kWh" 
              valueStyle={{ color: '#fa8c16', fontSize: '20px' }}
            />
          </Col>
        </Row>
      </div>
      
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #303030' }}>
        <div className="section-title">运维控制</div>
        
        <Row gutter={8} style={{ marginBottom: '16px' }}>
          <Col span={12}>
            <Button 
              type="primary" 
              icon={<PlayCircleOutlined />}
              block
              loading={commandLoading}
              onClick={() => handleCommand('start')}
              disabled={selectedDevice.status === 'running'}
            >
              启动
            </Button>
          </Col>
          <Col span={12}>
            <Button 
              danger
              icon={<PauseCircleOutlined />}
              block
              loading={commandLoading}
              onClick={() => handleCommand('stop')}
              disabled={selectedDevice.status === 'stopped'}
            >
              停止
            </Button>
          </Col>
        </Row>
        
        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'rgba(255,255,255,0.75)', marginBottom: '8px', fontSize: '14px' }}>
          运行速度: {selectedDevice.speed}%
          </div>
          <Slider 
            min={0} 
            max={100} 
            value={selectedDevice.speed}
            onChange={handleSpeedChange}
            disabled={selectedDevice.status !== 'running'}
          />
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'rgba(255,255,255,0.75)', marginBottom: '8px', fontSize: '14px' }}>
          工作模式
          </div>
          <Select 
            style={{ width: '100% }}
            value={selectedDevice.mode}
            onChange={handleModeChange}
          >
            <Option value="auto">自动模式</Option>
            <Option value="manual">手动模式</Option>
            <Option value="maintenance">维护模式</Option>
          </Select>
        </div>
        
        <Button 
          block 
          icon={<ReloadOutlined />}
          onClick={() => handleCommand('reset')}
        >
          重置设备
        </Button>
      </div>
      
      <div style={{ marginTop: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
        <WarningOutlined style={{ color: '#faad14', marginRight: '8px' }} />
        最后更新: {dayjs(selectedDevice.lastUpdate).format('HH:mm:ss')}
      </div>
    </div>
  )
}
