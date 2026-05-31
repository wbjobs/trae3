import React, { useState } from 'react'
import { Layout, Menu, theme } from 'antd'
import {
  UploadOutlined,
  UnorderedListOutlined,
  ScanOutlined
} from '@ant-design/icons'
import ImageUploader from './components/ImageUploader'
import ResultDisplay from './components/ResultDisplay'
import RecordList from './components/RecordList'
import type { RecognitionResponse } from './types'

const { Header, Content, Sider } = Layout

type MenuKey = 'recognize' | 'records'

const App: React.FC = () => {
  const [activeKey, setActiveKey] = useState<MenuKey>('recognize')
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResponse | null>(null)
  const [recognitionImageUrl, setRecognitionImageUrl] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  const handleRecognizeComplete = (result: RecognitionResponse, imageUrl: string) => {
    setRecognitionResult(result)
    setRecognitionImageUrl(imageUrl)
    setRefreshTrigger(prev => prev + 1)
  }

  const handleUpdate = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  const menuItems = [
    {
      key: 'recognize',
      icon: <ScanOutlined />,
      label: '铭牌识别'
    },
    {
      key: 'records',
      icon: <UnorderedListOutlined />,
      label: '档案记录'
    }
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0">
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: 'white', margin: 0, fontSize: 18 }}>
            <ScanOutlined style={{ marginRight: 8 }} />
            铭牌OCR系统
          </h2>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          items={menuItems}
          onClick={({ key }) => setActiveKey(key as MenuKey)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }}>
          <div style={{ padding: '0 24px', fontSize: 18, fontWeight: 'bold' }}>
            {activeKey === 'recognize' ? '铭牌图像识别' : '工业档案数据库'}
          </div>
        </Header>
        <Content style={{ margin: '24px 16px', padding: 24, minHeight: 280, background: colorBgContainer, borderRadius: borderRadiusLG }}>
          {activeKey === 'recognize' && (
            <div>
              <ImageUploader onRecognizeComplete={handleRecognizeComplete} />
              <ResultDisplay
                result={recognitionResult}
                imageUrl={recognitionImageUrl}
                onUpdate={handleUpdate}
              />
            </div>
          )}
          {activeKey === 'records' && (
            <RecordList key={refreshTrigger} />
          )}
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
