import request from './request'
import { LoginParams, RegisterParams, TokenResult, User } from '@/types'

export const authApi = {
  login: (params: LoginParams) => {
    return request.post<TokenResult>('/auth/login', params)
  },

  register: (params: RegisterParams) => {
    return request.post('/auth/register', params)
  },

  logout: () => {
    return request.post('/auth/logout')
  },

  getUserInfo: () => {
    return request.get<User>('/auth/user-info')
  }
}

export default authApi
