import axiosInstance from './axios'
import { User } from '../types'

export interface LoginResponse {
  token: string
  userId: number
  username: string
  realName: string
  tenantId: number
  roles: string[]
}

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export const login = (username: string, password: string): Promise<ApiResponse<LoginResponse>> => {
  return axiosInstance.post('/auth/login', { username, password }).then(res => res.data)
}

export const register = (username: string, password: string, realName?: string, tenantId?: number, department?: string): Promise<ApiResponse<any>> => {
  return axiosInstance.post('/auth/register', { username, password, realName, tenantId, department }).then(res => res.data)
}

export const getUserInfo = (): Promise<ApiResponse<User>> => {
  return axiosInstance.get('/auth/info').then(res => res.data)
}
