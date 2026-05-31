import { post, get } from '@/utils/request'
import type { LoginRequest, LoginResponse, UserInfo, ApiResponse } from '@/types'

export function login(data: LoginRequest): Promise<ApiResponse<LoginResponse>> {
  return post<ApiResponse<LoginResponse>>('/auth/login', data)
}

export function logout(): Promise<ApiResponse<null>> {
  return post<ApiResponse<null>>('/auth/logout')
}

export function getUserInfo(): Promise<ApiResponse<UserInfo>> {
  return get<ApiResponse<UserInfo>>('/auth/info')
}

export function changePassword(data: { oldPassword: string; newPassword: string }): Promise<ApiResponse<null>> {
  return post<ApiResponse<null>>('/auth/password', data)
}
