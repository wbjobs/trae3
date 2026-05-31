import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  tenantId: number | null
  isLoggedIn: boolean
  login: (user: User, token: string) => void
  logout: () => void
  setTenant: (tenantId: number) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      tenantId: null,
      isLoggedIn: false,
      login: (user: User, token: string) => {
        set({
          user,
          token,
          tenantId: user.tenantId,
          isLoggedIn: true,
        })
      },
      logout: () => {
        set({
          user: null,
          token: null,
          tenantId: null,
          isLoggedIn: false,
        })
      },
      setTenant: (tenantId: number) => {
        set({ tenantId })
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)

export const getAuthHeaders = () => {
  const state = useAuthStore.getState()
  const headers: Record<string, string> = {}
  
  if (state.user?.id) {
    headers['X-User-Id'] = String(state.user.id)
  }
  if (state.tenantId) {
    headers['X-Tenant-Id'] = String(state.tenantId)
  }
  if (state.user?.roles?.length) {
    headers['X-Role'] = state.user.roles.join(',')
  }
  
  return headers
}
