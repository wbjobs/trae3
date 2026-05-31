import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Charts from '@/pages/Charts';
import Alerts from '@/pages/Alerts';
import Metrics from '@/pages/Metrics';
import PressureMonitor from '@/pages/PressureMonitor';
import RegionAnalysis from '@/pages/RegionAnalysis';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/charts" element={<Charts />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/pressure" element={<PressureMonitor />} />
          <Route path="/region" element={<RegionAnalysis />} />
        </Route>
      </Routes>
    </Router>
  );
}
