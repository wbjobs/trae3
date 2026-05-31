import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo, Environment, UserRole } from '@/types'
import { login as apiLogin, logout as apiLogout, getUserInfo } from '@/api/auth'
import router from '@/router'

const TOKEN_KEY = 'node_trace_token'
const USER_KEY = 'node_trace_user'
const ENV_KEY = 'node_trace_env'

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '')
  const userInfo = ref<UserInfo | null>(null)
  const environment = ref<Environment>(
    (localStorage.getItem(ENV_KEY) as Environment) || 
    (import.meta.env.VITE_APP_ENV as Environment) || 
    'development'
  )

  const isLoggedIn = computed(() => !!token.value)
  const role = computed<UserRole | null>(() => userInfo.value?.role || null)

  function setToken(newToken: string) {
    token.value = newToken
    localStorage.setItem(TOKEN_KEY, newToken)
  }

  function setUserInfo(info: UserInfo) {
    userInfo.value = info
    localStorage.setItem(USER_KEY, JSON.stringify(info))
  }

  function setEnvironment(env: Environment) {
    environment.value = env
    localStorage.setItem(ENV_KEY, env)
  }

  function hasPermission(permission: string): boolean {
    if (!userInfo.value) return false
    
    const role = userInfo.value.role
    if (role === 'admin') return true
    
    const permissions: Record<UserRole, string[]> = {
      admin: ['*'],
      operator: ['node:view', 'node:control', 'room:view', 'room:control', 'audit:view'],
      viewer: ['node:view', 'room:view', 'audit:view']
    }
    
    return permissions[role]?.includes(permission) || false
  }

  async function login(username: string, password: string, env: Environment) {
    const res = await apiLogin({ username, password, environment: env })
    if (res.code === 200) {
      setToken(res.data.token)
      setUserInfo({ ...res.data.user, environment: env })
      setEnvironment(env)
      return true
    }
    return false
  }

  async function fetchUserInfo() {
    try {
      const res = await getUserInfo()
      if (res.code === 200) {
        setUserInfo({ ...res.data, environment: environment.value })
        return res.data
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
    return null
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    router.push('/login')
  }

  function initFromStorage() {
    const savedUser = localStorage.getItem(USER_KEY)
    if (savedUser) {
      try {
        userInfo.value = JSON.parse(savedUser)
      } catch (e) {
        console.error('解析用户信息失败:', e)
      }
    }
  }

  return {
    token,
    userInfo,
    environment,
    isLoggedIn,
    role,
    setToken,
    setUserInfo,
    setEnvironment,
    hasPermission,
    login,
    fetchUserInfo,
    logout,
    initFromStorage
  }
})
