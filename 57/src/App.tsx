import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Analysis from '@/pages/Analysis'
import Query from '@/pages/Query'
import Anomaly from '@/pages/Anomaly'
import Ingestion from '@/pages/Ingestion'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/query" element={<Query />} />
          <Route path="/anomaly" element={<Anomaly />} />
          <Route path="/ingestion" element={<Ingestion />} />
        </Route>
      </Routes>
    </Router>
  )
}
