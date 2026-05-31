import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Sensors from '@/pages/Sensors';
import ScadaDesigner from '@/pages/ScadaDesigner';
import ScadaRuntime from '@/pages/ScadaRuntime';
import DataQuery from '@/pages/DataQuery';
import Login from '@/pages/Login';
import { useAuthStore } from '@/stores/auth-store';

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sensors" element={<Sensors />} />
          <Route path="/scada" element={<ScadaDesigner />} />
          <Route path="/scada/:id" element={<ScadaRuntime />} />
          <Route path="/data" element={<DataQuery />} />
        </Route>
      </Routes>
    </Router>
  );
}
