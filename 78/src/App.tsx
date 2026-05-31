import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Upload from '@/pages/Upload'
import Result from '@/pages/Result'
import Records from '@/pages/Records'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Upload />} />
          <Route path="/result/:id" element={<Result />} />
          <Route path="/records" element={<Records />} />
        </Route>
      </Routes>
    </Router>
  )
}
