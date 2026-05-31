import { useState } from 'react'
import { Tooltip, Avatar, Badge } from 'antd'
import { TeamOutlined, UserOutlined } from '@ant-design/icons'
import useStore from '../../store/useStore'

const userColors = [
  '#1890ff', '#52c41a', '#faad14', '#722ed1', 
  '#eb2f96', '#13c2c2', '#fa8c16', '#2f54eb'
]

export default function CollaborationPanel() {
  const onlineUsers = useStore(state => state.onlineUsers)
  const currentUser = useStore(state => state.currentUser)

  const getUserColor = (index) => userColors[index % userColors.length]

  const getInitial = (name) => {
    if (!name) return '?'
    return name.charAt(0).toUpperCase()
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <div className="section-title">
        <TeamOutlined style={{ color: '#52c41a' }} />
        在线协同 ({onlineUsers.length})
      </div>
      
      <div className="online-users">
        {onlineUsers.map((user, index) => (
          <Tooltip 
            key={user.id} 
            title={`${user.name}${user.id === currentUser?.id ? ' (我)' : ''}`}
          >
            <Badge 
              status={user.selectedDevice ? 'processing' : 'default'}
              dot
            >
              <div 
                className="user-avatar"
                style={{ 
                  backgroundColor: getUserColor(index),
                  border: user.id === currentUser?.id ? '2px solid #fff' : 'none'
                }}
              >
                {getInitial(user.name)}
              </div>
            </Badge>
          </Tooltip>
        ))}
        
        {onlineUsers.length === 0 && (
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
            暂无其他用户在线
          </span>
        )}
      </div>
      
      {currentUser && (
        <div style={{ 
          marginTop: '12px', 
          padding: '8px', 
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '4px',
          fontSize: '12px',
          color: 'rgba(255,255,255,0.6)'
        }}>
          <UserOutlined style={{ marginRight: '8px' }} />
          当前用户: {currentUser.name}
        </div>
      )}
    </div>
  )
}
