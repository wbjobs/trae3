import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store'
import { setToken, setUser, setTenant, setTenants, setPermissions, logout } from '@/store/user'
import { authApi } from '@/api'
import { LoginParams, RegisterParams } from '@/types'

export const useAuth = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { token, user, tenant, tenants, permissions } = useAppSelector(state => state.user)

  const login = useCallback(async (params: LoginParams) => {
    const res = await authApi.login(params)
    dispatch(setToken(res.data.accessToken))
    dispatch(setTenant({ id: res.data.tenantId, name: res.data.tenantName, code: params.tenantCode || '', status: 1, createTime: '' }))
    await fetchUserInfo()
    navigate('/')
  }, [dispatch, navigate])

  const register = useCallback(async (params: RegisterParams) => {
    const res = await authApi.register(params)
    dispatch(setToken(res.data.accessToken))
    dispatch(setTenant({ id: 0, name: params.tenantName || '', code: params.tenantCode || '', status: 1, createTime: '' }))
    await fetchUserInfo()
    navigate('/')
  }, [dispatch, navigate])

  const fetchUserInfo = useCallback(async () => {
    const res = await authApi.getUserInfo()
    dispatch(setUser(res.data))
    dispatch(setPermissions(res.data.permissions || []))
  }, [dispatch])

  const fetchTenants = useCallback(async () => {
    await authApi.getUserInfo()
    dispatch(setTenants([]))
  }, [dispatch])

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch (e) {
      console.error('Logout error:', e)
    }
    dispatch(logout())
    navigate('/login')
  }, [dispatch, navigate])

  const isAuthenticated = !!token

  useEffect(() => {
    if (token && !user) {
      fetchUserInfo()
    }
  }, [token, user, fetchUserInfo])

  return {
    token,
    user,
    tenant,
    tenants,
    permissions,
    isAuthenticated,
    login,
    register,
    logout: handleLogout,
    fetchUserInfo,
    fetchTenants
  }
}

export default useAuth
