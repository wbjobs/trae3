import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Converter from './pages/Converter';
import Comparator from './pages/Comparator';
import Sync from './pages/Sync';
import Cache from './pages/Cache';
import Encryption from './pages/Encryption';

const App: React.FC = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/converter" element={<Converter />} />
        <Route path="/comparator" element={<Comparator />} />
        <Route path="/sync" element={<Sync />} />
        <Route path="/cache" element={<Cache />} />
        <Route path="/encryption" element={<Encryption />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
};

export default App;
