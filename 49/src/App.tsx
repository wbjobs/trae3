import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import ScenePage from '@/pages/ScenePage'
import InspectPage from '@/pages/InspectPage'
import CollabPage from '@/pages/CollabPage'
import MonitorPage from '@/pages/MonitorPage'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ScenePage />} />
        <Route path="/inspect" element={<InspectPage />} />
        <Route path="/collab" element={<CollabPage />} />
        <Route path="/monitor" element={<MonitorPage />} />
      </Routes>
    </Router>
  )
}
