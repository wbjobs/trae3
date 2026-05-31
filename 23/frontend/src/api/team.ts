import request from './request'
import { TeamMember, Role, Permission, PageResult } from '@/types'

export const teamApi = {
  getMembers: (pageNum: number, pageSize: number, keyword?: string) => {
    return request.get<PageResult<TeamMember>>('/team/members', {
      params: { pageNum, pageSize, keyword }
    })
  },

  addMember: (userId: number, roleId: number) => {
    return request.post<TeamMember>('/team/members', { userId, roleId })
  },

  updateMemberRole: (memberId: number, roleId: number) => {
    return request.put<TeamMember>(`/team/members/${memberId}`, { roleId })
  },

  removeMember: (memberId: number) => {
    return request.delete(`/team/members/${memberId}`)
  },

  getRoles: () => {
    return request.get<Role[]>('/team/roles')
  },

  createRole: (name: string, code: string, description: string) => {
    return request.post<Role>('/team/roles', { name, code, description })
  },

  updateRole: (id: number, name: string, code: string, description: string) => {
    return request.put<Role>(`/team/roles/${id}`, { name, code, description })
  },

  deleteRole: (id: number) => {
    return request.delete(`/team/roles/${id}`)
  },

  getPermissions: () => {
    return request.get<Permission[]>('/team/permissions')
  },

  getRolePermissions: (roleId: number) => {
    return request.get<number[]>(`/team/roles/${roleId}/permissions`)
  },

  assignRolePermissions: (roleId: number, permissionIds: number[]) => {
    return request.post(`/team/roles/${roleId}/permissions`, { permissionIds })
  }
}

export default teamApi
