import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import DeviceDetail from "@/pages/DeviceDetail";
import ConfigManager from "@/pages/ConfigManager";
import AlertCenter from "@/pages/AlertCenter";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/device/:id" element={<DeviceDetail />} />
          <Route path="/config" element={<ConfigManager />} />
          <Route path="/alerts" element={<AlertCenter />} />
        </Route>
      </Routes>
    </Router>
  );
}
