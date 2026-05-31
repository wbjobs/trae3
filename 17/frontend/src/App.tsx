import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import Dashboard from '@/pages/Dashboard';
import DataQuery from '@/pages/DataQuery';
import FaultAnalysis from '@/pages/FaultAnalysis';
import ArrayGroup from '@/pages/ArrayGroup';
import ReportCenter from '@/pages/ReportCenter';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={
            <MainLayout>
              <Dashboard />
            </MainLayout>
          }
        />
        <Route
          path="/data-query"
          element={
            <MainLayout>
              <DataQuery />
            </MainLayout>
          }
        />
        <Route
          path="/fault-analysis"
          element={
            <MainLayout>
              <FaultAnalysis />
            </MainLayout>
          }
        />
        <Route
          path="/array-group"
          element={
            <MainLayout>
              <ArrayGroup />
            </MainLayout>
          }
        />
        <Route
          path="/report-center"
          element={
            <MainLayout>
              <ReportCenter />
            </MainLayout>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}
