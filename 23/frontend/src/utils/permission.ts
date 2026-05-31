import { storage } from './storage'

export const hasPermission = (permission: string): boolean => {
  const user = storage.getUser()
  if (!user || !user.permissions) return false
  return user.permissions.includes(permission) || user.permissions.includes('*')
}

export const hasAnyPermission = (permissions: string[]): boolean => {
  return permissions.some(p => hasPermission(p))
}

export const hasAllPermissions = (permissions: string[]): boolean => {
  return permissions.every(p => hasPermission(p))
}

export const hasRole = (role: string): boolean => {
  const user = storage.getUser()
  if (!user || !user.roles) return false
  return user.roles.includes(role)
}
