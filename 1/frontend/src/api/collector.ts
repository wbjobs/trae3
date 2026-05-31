import { get, post } from '@/utils/request'
import type { ApiResponse } from '@/types'

export function getCollectorStatus(): Promise<ApiResponse<{
  status: 'running' | 'stopped' | 'error'
  taskCount: number
  activeTasks: number
  lastCollectTime: string
  uptime: number
}>> {
  return get<ApiResponse<any>>('/collector/status')
}

export function triggerCollect(nodeId?: string): Promise<ApiResponse<null>> {
  return post<ApiResponse<null>>('/collector/trigger', { nodeId })
}

export function getCollectorConfig(): Promise<ApiResponse<{
  interval: number
  timeout: number
  retryCount: number
}>> {
  return get<ApiResponse<any>>('/collector/config')
}
