import { Routes, Route, Navigate } from 'react-router-dom'
import PrivateRoute from './components/PrivateRoute'
import MainLayout from './components/MainLayout'
import Login from './pages/Login'
import SampleList from './pages/SampleManage/SampleList'
import CrossDeptQuery from './pages/CrossDeptQuery/CrossDeptQuery'
import AttachmentList from './pages/AttachmentManage/AttachmentList'
import ValidationRules from './pages/Admin/ValidationRules'
import TenantManage from './pages/Admin/TenantManage'

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<PrivateRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/samples" element={<SampleList />} />
          <Route path="/cross-dept-query" element={<CrossDeptQuery />} />
          <Route path="/attachments" element={<AttachmentList />} />
          <Route path="/admin/validation-rules" element={<ValidationRules />} />
          <Route path="/admin/tenants" element={<TenantManage />} />
          <Route path="/" element={<Navigate to="/samples" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/samples" replace />} />
    </Routes>
  )
}

export default App
