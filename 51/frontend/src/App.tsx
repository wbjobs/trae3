import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from 'antd';
import MainLayout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Terminals from './pages/Terminals';
import TerminalDetail from './pages/TerminalDetail';
import Alerts from './pages/Alerts';
import Timeline from './pages/Timeline';
import Settings from './pages/Settings';

const { Content } = Layout;

const App: React.FC = () => {
  return (
    <MainLayout>
      <Content style={{ padding: '24px', minHeight: 'calc(100vh - 64px)' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/terminals" element={<Terminals />} />
          <Route path="/terminals/:id" element={<TerminalDetail />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Content>
    </MainLayout>
  );
};

export default App;