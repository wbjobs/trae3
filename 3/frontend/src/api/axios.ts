import axios from 'axios'
import { message } from 'antd'
import { getAuthHeaders, useAuthStore } from '../store/authStore'

const axiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

axiosInstance.interceptors.request.use(
  (config) => {
    const headers = getAuthHeaders()
    Object.keys(headers).forEach((key) => {
      config.headers[key] = headers[key]
    })
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

axiosInstance.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      if (status === 401) {
        useAuthStore.getState().logout()
        message.error('登录已过期，请重新登录')
        window.location.href = '/login'
      } else if (status === 403) {
        message.error('没有权限访问')
      } else if (status === 500) {
        message.error(data?.message || '服务器错误')
      } else {
        message.error(data?.message || '请求失败')
      }
    } else if (error.request) {
      message.error('网络错误，请检查网络连接')
    } else {
      message.error('请求配置错误')
    }
    return Promise.reject(error)
  }
)

export default axiosInstance
