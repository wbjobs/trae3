import { Row, Col } from 'antd'
import { 
  ThunderboltOutlined, 
  CheckCircleOutlined, 
  PauseCircleOutlined, 
  WarningOutlined 
} from '@ant-design/icons'
import useStore from '../../store/useStore'

export default function StatsPanel() {
  const deviceStats = useStore(state => state.deviceStats)

  const stats = [
    { 
      label: '设备总数', 
      value: deviceStats.total, 
      color: '#1890ff',
      icon: <ThunderboltOutlined />
    },
    { 
      label: '运行中', 
      value: deviceStats.running, 
      color: '#52c41a',
      icon: <CheckCircleOutlined />
    },
    { 
      label: '已停止', 
      value: deviceStats.stopped, 
      color: '#faad14',
      icon: <PauseCircleOutlined />
    },
    { 
      label: '故障', 
      value: deviceStats.fault, 
      color: '#ff4d4f',
      icon: <WarningOutlined />
    }
  ]

  return (
    <div style={{ marginBottom: '20px' }}>
      <Row gutter={8}>
        {stats.map((stat, index) => (
          <Col span={6} key={index}>
            <div className="stat-card">
              <div style={{ color: stat.color, marginBottom: '4px', fontSize: '20px' }}>
                {stat.icon}
              </div>
              <div className="stat-value" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="stat-label">{stat.label}</div>
            </div>
          </Col>
        ))}
      </Row>
    </div>
  )
}
