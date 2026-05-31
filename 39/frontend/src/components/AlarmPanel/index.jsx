import { useState, useEffect } from 'react'
import { Button, Empty, Tag, Modal, message } from 'antd'
import { 
  BellOutlined, WarningOutlined, CheckCircleOutlined, DeleteOutlined } from '@ant-design/icons'
import useStore from '../../store/useStore'
import dayjs from 'dayjs'
import socketService from '../../services/socket'

const alarmTypeMap = {
  critical: { 
    color: 'error',
    icon: <WarningOutlined />,
    label: '严重'
  },
  warning: {
    color: 'warning',
    icon: <BellOutlined />,
    label: '警告'
  },
  info: {
    color: 'info',
    icon: <BellOutlined />,
    label: '信息'
  }
}

export default function AlarmPanel() {
  const [selectedAlarm, setSelectedAlarm] = useState(null)
  const alarms = useStore(state => state.alarms)
  const clearAlarm = useStore(state => state.clearAlarm)

  const handleAcknowledge = (alarm) => {
    Modal.confirm({
      title: '确认处理告警',
      content: `确定要处理告警 "${alarm.message}"?`,
      onOk: () => {
        clearAlarm(alarm.id)
        socketService.emit('alarm:acknowledge', { alarmId: alarm.id })
        message.success('告警已处理')
      }
    })
  }

  const handleAcknowledgeAll = () => {
    Modal.confirm({
      title: '确认清理所有告警',
      content: '确定要清理所有告警吗？此操作将同步到所有在线用户。',
      onOk: () => {
        socketService.emit('alarm:clearAll')
        message.success('已清理所有告警')
      }
    })
  }

  if (alarms.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<span style={{ color: 'rgba(255,255,255,0.5)' }}>暂无告警</span>}
      />
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="section-title">
          <BellOutlined style={{ color: '#ff4d4f' }} />
          实时告警 ({alarms.length})
          </span>
        {alarms.length > 0 && (
          <Button 
            size="small" 
            type="link" 
            onClick={handleAcknowledgeAll}
          >
            全部处理
            </Button>
        )}
      </div>
      
      {alarms.slice(0, 10).map(alarm => {
        const typeInfo = alarmTypeMap[alarm.type] || alarmTypeMap.info
        
        return (
          <div 
            key={alarm.id} 
            className={`alarm-item ${alarm.type}`}
            onClick={() => setSelectedAlarm(alarm)}
            style={{ cursor: 'pointer' }}
          >
            <div className="alarm-title">
              <Tag color={typeInfo.color}>
                {typeInfo.icon} {typeInfo.label}
              </Tag>
              <span style={{ marginLeft: '8px' }}>{alarm.deviceName}</span>
            </div>
            <div style={{ color: '#fff', marginBottom: '4px' }}>
              {alarm.message}
            </div>
            <div className="alarm-time">
              {dayjs(alarm.timestamp).format('HH:mm:ss')}
            </div>
            {selectedAlarm?.id === alarm.id && (
              <div style={{ marginTop: '8px' }}>
                <Button 
                  size="small" 
                  type="primary" 
                  icon={<CheckCircleOutlined />}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAcknowledge(alarm)
                  }}
                >
                  处理
                  </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
