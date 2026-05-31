import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import TaskList from "@/pages/TaskList";
import TaskCreate from "@/pages/TaskCreate";
import NodeList from "@/pages/NodeList";
import ResultList from "@/pages/ResultList";
import ResultDetail from "@/pages/ResultDetail";
import Home from "@/pages/Home";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/create" element={<TaskCreate />} />
          <Route path="/nodes" element={<NodeList />} />
          <Route path="/results" element={<ResultList />} />
          <Route path="/results/:id" element={<ResultDetail />} />
        </Route>
        <Route path="/home" element={<Home />} />
      </Routes>
    </Router>
  );
}
