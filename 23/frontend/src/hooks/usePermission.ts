import { useCallback } from 'react'
import { useAppSelector } from '@/store'

export const usePermission = () => {
  const permissions = useAppSelector(state => state.user.permissions)

  const hasPermission = useCallback((permission: string): boolean => {
    return permissions.includes(permission) || permissions.includes('*')
  }, [permissions])

  const hasAnyPermission = useCallback((permissionList: string[]): boolean => {
    return permissionList.some(p => hasPermission(p))
  }, [hasPermission])

  const hasAllPermissions = useCallback((permissionList: string[]): boolean => {
    return permissionList.every(p => hasPermission(p))
  }, [hasPermission])

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions
  }
}

export default usePermission
