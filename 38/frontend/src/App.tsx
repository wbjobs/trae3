import React, { useState } from 'react'
import { Layout, Menu, Button, Space, Typography, theme } from 'antd'
import {
  UploadOutlined,
  BarChartOutlined,
  EditOutlined,
  DatabaseOutlined,
  ApiOutlined,
} from '@ant-design/icons'
import DocumentUpload from './components/DocumentUpload'
import GraphPreview from './components/GraphPreview'
import ResultEditor from './components/ResultEditor'

const { Header, Sider, Content } = Layout
const { Title } = Typography

type TabKey = 'upload' | 'graph' | 'editor'

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('upload')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>(undefined)
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  const handleParseComplete = (docId: string) => {
    setRefreshKey((k) => k + 1)
    if (docId !== 'all') {
      setSelectedDocId(docId)
    }
  }

  const menuItems = [
    {
      key: 'upload',
      icon: <UploadOutlined />,
      label: '文档上传',
    },
    {
      key: 'graph',
      icon: <BarChartOutlined />,
      label: '图谱预览',
    },
    {
      key: 'editor',
      icon: <EditOutlined />,
      label: '结果编辑',
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220}>
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 0',
          }}
        >
          <Space>
            <DatabaseOutlined style={{ fontSize: 24, color: '#fff' }} />
            <Title level={5} style={{ color: '#fff', margin: 0 }}>
              知识图谱构建平台
            </Title>
          </Space>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeTab]}
          items={menuItems}
          onClick={({ key }) => setActiveTab(key as TabKey)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Space>
            <Title level={4} style={{ margin: 0 }}>
              {menuItems.find((m) => m.key === activeTab)?.label}
            </Title>
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<ApiOutlined />}
              onClick={() => window.open('http://localhost:8000/docs', '_blank')}
            >
              API 文档
            </Button>
          </Space>
        </Header>
        <Content
          style={{
            margin: '24px',
            padding: 24,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: 'auto',
          }}
        >
          {activeTab === 'upload' && (
            <DocumentUpload onParseComplete={handleParseComplete} />
          )}
          {activeTab === 'graph' && (
            <GraphPreview docId={selectedDocId} refreshKey={refreshKey} />
          )}
          {activeTab === 'editor' && <ResultEditor refreshKey={refreshKey} />}
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
