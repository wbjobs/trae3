import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import ArchiveInput from './pages/ArchiveInput';
import ArchiveSearch from './pages/ArchiveSearch';
import ArchivePreview from './pages/ArchivePreview';
import BatchImport from './pages/BatchImport';
import ReviewManager from './pages/ReviewManager';

const { Header, Content, Sider } = Layout;

const menuItems = [
  { key: '/', label: '档案录入', icon: '📝' },
  { key: '/batch-import', label: '批量导入', icon: '📥' },
  { key: '/search', label: '编目检索', icon: '🔍' },
  { key: '/review', label: '编目审核', icon: '✅' },
  { key: '/preview', label: '预览页面', icon: '👁️' }
];

function AppContent() {
  const location = useLocation();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#001529', padding: '0 24px' }}>
        <h1 style={{ color: 'white', margin: 0, lineHeight: '64px' }}>档案管理系统</h1>
      </Header>
      <Layout>
        <Sider width={200} style={{ background: '#fff' }}>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            style={{ height: '100%', borderRight: 0 }}
          >
            {menuItems.map(item => (
              <Menu.Item key={item.key}>
                <Link to={item.key}>
                  {item.icon} {item.label}
                </Link>
              </Menu.Item>
            ))}
          </Menu>
        </Sider>
        <Layout style={{ padding: '24px' }}>
          <Content
            style={{
              padding: 24,
              margin: 0,
              minHeight: 280,
              background: '#fff',
              borderRadius: 8
            }}
          >
            <Routes>
              <Route path="/" element={<ArchiveInput />} />
              <Route path="/batch-import" element={<BatchImport />} />
              <Route path="/search" element={<ArchiveSearch />} />
              <Route path="/review" element={<ReviewManager />} />
              <Route path="/preview/:id" element={<ArchivePreview />} />
              <Route path="/preview" element={<ArchivePreview />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
