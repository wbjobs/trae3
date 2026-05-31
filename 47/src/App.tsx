import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Anomaly from './pages/Anomaly'
import History from './pages/History'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/anomaly" element={<Anomaly />} />
          <Route path="/history" element={<History />} />
        </Route>
      </Routes>
    </Router>
  )
}
