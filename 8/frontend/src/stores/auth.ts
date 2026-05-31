import { defineStore } from 'pinia'
import { ref } from 'vue'
import { loginApi, getMeApi } from '@/utils/api'
import type { UserInfo } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))

  async function login(username: string, password: string) {
    const res = await loginApi(username, password)
    token.value = res.access_token
    user.value = res.user
    localStorage.setItem('token', res.access_token)
  }

  async function fetchUser() {
    try {
      const res = await getMeApi()
      user.value = res as UserInfo
    } catch {
      logout()
    }
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
  }

  const isAdmin = () => user.value?.role === 'admin'

  return { user, token, login, fetchUser, logout, isAdmin }
})
