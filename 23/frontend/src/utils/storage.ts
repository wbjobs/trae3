const TOKEN_KEY = 'specimen_token'
const USER_KEY = 'specimen_user'
const TENANT_KEY = 'specimen_tenant'

export const storage = {
  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY)
  },
  setToken: (token: string): void => {
    localStorage.setItem(TOKEN_KEY, token)
  },
  removeToken: (): void => {
    localStorage.removeItem(TOKEN_KEY)
  },

  getUser: () => {
    const userStr = localStorage.getItem(USER_KEY)
    return userStr ? JSON.parse(userStr) : null
  },
  setUser: (user: any): void => {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  removeUser: (): void => {
    localStorage.removeItem(USER_KEY)
  },

  getTenant: (): number | null => {
    const tenant = localStorage.getItem(TENANT_KEY)
    return tenant ? Number(tenant) : null
  },
  setTenant: (tenantId: number): void => {
    localStorage.setItem(TENANT_KEY, String(tenantId))
  },
  removeTenant: (): void => {
    localStorage.removeItem(TENANT_KEY)
  },

  clear: (): void => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(TENANT_KEY)
  }
}
