import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import router from '@/router'
import { useUserStore } from '@/store/user'

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const userStore = useUserStore()
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`
    }
    config.headers['X-Environment'] = userStore.environment || import.meta.env.VITE_APP_ENV
    config.headers['X-Request-Time'] = Date.now().toString()
    return config
  },
  (error) => {
    console.error('请求错误:', error)
    return Promise.reject(error)
  }
)

service.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data
    const traceId = response.headers['x-trace-id']
    
    if (res.code !== 200) {
      ElMessage({
        message: res.message || '请求失败',
        type: 'error',
        duration: 3000
      })

      if (res.code === 401) {
        ElMessageBox.confirm('登录状态已过期，请重新登录', '提示', {
          confirmButtonText: '重新登录',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          const userStore = useUserStore()
          userStore.logout()
          router.push('/login')
        })
      }

      return Promise.reject(new Error(res.message || '请求失败'))
    }

    return {
      ...res,
      traceId: traceId || res.traceId
    }
  },
  (error) => {
    console.error('响应错误:', error)
    
    let message = '网络错误'
    if (error.response) {
      switch (error.response.status) {
        case 401:
          message = '未授权，请重新登录'
          const userStore = useUserStore()
          userStore.logout()
          router.push('/login')
          break
        case 403:
          message = '拒绝访问'
          break
        case 404:
          message = '请求地址不存在'
          break
        case 500:
          message = '服务器内部错误'
          break
        default:
          message = error.response.data?.message || `连接错误 ${error.response.status}`
      }
    } else if (error.request) {
      message = '服务器无响应'
    }

    ElMessage({
      message,
      type: 'error',
      duration: 3000
    })

    return Promise.reject(error)
  }
)

export interface RequestConfig extends AxiosRequestConfig {
  showLoading?: boolean
  showError?: boolean
}

export function request<T = any>(config: RequestConfig): Promise<T> {
  return service.request<any, T>(config)
}

export function get<T = any>(url: string, params?: any, config?: RequestConfig): Promise<T> {
  return request<T>({ ...config, method: 'GET', url, params })
}

export function post<T = any>(url: string, data?: any, config?: RequestConfig): Promise<T> {
  return request<T>({ ...config, method: 'POST', url, data })
}

export function put<T = any>(url: string, data?: any, config?: RequestConfig): Promise<T> {
  return request<T>({ ...config, method: 'PUT', url, data })
}

export function del<T = any>(url: string, params?: any, config?: RequestConfig): Promise<T> {
  return request<T>({ ...config, method: 'DELETE', url, params })
}

export default service
