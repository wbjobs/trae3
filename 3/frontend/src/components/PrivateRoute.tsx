import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const PrivateRoute = () => {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)

  return isLoggedIn ? <Outlet /> : <Navigate to="/login" replace />
}

export default PrivateRoute
