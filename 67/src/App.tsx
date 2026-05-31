import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import AnomalyDetail from "@/pages/AnomalyDetail";
import TraceAnalysis from "@/pages/TraceAnalysis";
import CorrelationAnalysis from "@/pages/CorrelationAnalysis";
import VirtualAnomalyList from "@/components/VirtualAnomalyList";

function Layout() {
  return (
    <div className="flex h-screen bg-ops-dark overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function AnomaliesPage() {
  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="bg-ops-card rounded-xl border border-ops-border p-4">
        <h2 className="text-ops-text text-lg font-semibold mb-4">All Anomalies</h2>
      </div>
      <div className="flex-1 min-h-0">
        <VirtualAnomalyList />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/anomalies" element={<AnomaliesPage />} />
          <Route path="/anomaly/:id" element={<AnomalyDetail />} />
          <Route path="/trace/:anomalyId" element={<TraceAnalysis />} />
          <Route path="/trace" element={<Navigate to="/anomalies" replace />} />
          <Route path="/correlation" element={<CorrelationAnalysis />} />
        </Route>
      </Routes>
    </Router>
  );
}
