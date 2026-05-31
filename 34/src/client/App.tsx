import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from 'antd';
import AppHeader from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import TaskConfig from './pages/TaskConfig';
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import NodeMonitor from './pages/NodeMonitor';
import ResultViewer from './pages/ResultViewer';
import './styles/App.css';

const { Content } = Layout;

const App: React.FC = () => {
  return (
    <Layout className="app-layout">
      <AppHeader />
      <Layout>
        <Sidebar />
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<TaskList />} />
            <Route path="/tasks/new" element={<TaskConfig />} />
            <Route path="/tasks/:taskId" element={<TaskDetail />} />
            <Route path="/nodes" element={<NodeMonitor />} />
            <Route path="/results/:taskId" element={<ResultViewer />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
