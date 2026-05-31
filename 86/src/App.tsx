import { useEffect, useState } from 'react';
import { Layout, Spin, message, ConfigProvider, theme } from 'antd';
import { useAppStore } from '@/store';
import Sidebar from '@/components/Sidebar';
import EditorArea from '@/components/EditorArea';
import ProblemPanel from '@/components/ProblemPanel';
import StatusBar from '@/components/StatusBar';
import Toolbar from '@/components/Toolbar';
import AppHeader from '@/components/AppHeader';
import WelcomeModal from '@/components/WelcomeModal';

const { Sider, Content } = Layout;

function App() {
  const { init, isLoading, error, setError } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (error) {
      message.error(error);
      setError(null);
    }
  }, [error, setError]);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 4
        }
      }}
    >
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        <AppHeader />
        
        <Layout>
          <Sider
            width={280}
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            theme="dark"
            style={{ background: '#141414' }}
          >
            <Sidebar collapsed={collapsed} />
          </Sider>
          
          <Layout style={{ display: 'flex', flexDirection: 'column' }}>
            <Toolbar />
            
            <Content style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <Spin spinning={isLoading} tip="加载中...">
                <EditorArea />
              </Spin>
            </Content>
            
            <ProblemPanel />
            <StatusBar />
          </Layout>
        </Layout>
        
        <WelcomeModal open={showWelcome} onClose={() => setShowWelcome(false)} />
      </Layout>
    </ConfigProvider>
  );
}

export default App;
