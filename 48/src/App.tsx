import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Layout from "@/components/Layout"
import InspectionWorkbench from "@/pages/InspectionWorkbench"
import DefectLibrary from "@/pages/DefectLibrary"
import Analytics from "@/pages/Analytics"
import ReportsPage from "@/pages/ReportsPage"

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<InspectionWorkbench />} />
          <Route path="/defects" element={<DefectLibrary />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Routes>
    </Router>
  )
}
