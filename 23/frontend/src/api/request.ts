import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { message } from 'antd'
import { storage } from '@/utils'
import { store } from '@/store'
import { logout } from '@/store/user'

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000
})

service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = storage.getToken()
    const tenantId = storage.getTenant()
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    if (tenantId) {
      config.headers['X-Tenant-Id'] = tenantId
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

service.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data
    if (res.code !== 200) {
      message.error(res.message || '请求失败')
      
      if (res.code === 401) {
        store.dispatch(logout())
        window.location.href = '/login'
      }
      
      return Promise.reject(new Error(res.message || '请求失败'))
    }
    return res
  },
  (error) => {
    const messageText = error.response?.data?.message || error.message || '网络错误'
    message.error(messageText)
    
    if (error.response?.status === 401) {
      store.dispatch(logout())
      window.location.href = '/login'
    }
    
    return Promise.reject(error)
  }
)

export interface Result<T = any> {
  code: number
  message: string
  data: T
}

export const request = {
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<Result<T>> => {
    return service.get(url, config)
  },
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<Result<T>> => {
    return service.post(url, data, config)
  },
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<Result<T>> => {
    return service.put(url, data, config)
  },
  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<Result<T>> => {
    return service.delete(url, config)
  },
  upload: <T = any>(url: string, data: FormData, onProgress?: (progress: number) => void): Promise<Result<T>> => {
    return service.post(url, data, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(progress)
        }
      }
    })
  }
}

export default request
