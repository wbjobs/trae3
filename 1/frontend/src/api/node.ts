import { get, post } from '@/utils/request'
import type { NodeInfo, TreeNode, NodeMetric, PageQuery, PageResult, ApiResponse } from '@/types'

export function getNodeList(params: PageQuery): Promise<ApiResponse<PageResult<NodeInfo>>> {
  return get<ApiResponse<PageResult<NodeInfo>>>('/nodes', params)
}

export function getNodeDetail(id: string): Promise<ApiResponse<NodeInfo>> {
  return get<ApiResponse<NodeInfo>>(`/nodes/${id}`)
}

export function getNodeTree(): Promise<ApiResponse<TreeNode[]>> {
  return get<ApiResponse<TreeNode[]>>('/nodes/tree')
}

export function getNodeMetrics(nodeId: string, params?: { hours?: number; startTime?: string; endTime?: string }): Promise<ApiResponse<{ list: NodeMetric[] }>> {
  return get<ApiResponse<{ list: NodeMetric[] }>>(`/nodes/${nodeId}/metrics`, params)
}

export function controlNode(id: string, action: 'start' | 'stop' | 'restart'): Promise<ApiResponse<null>> {
  return post<ApiResponse<null>>(`/nodes/${id}/control`, { action })
}

export function getNodeStats(): Promise<ApiResponse<{
  total: number
  online: number
  warning: number
  error: number
  offline: number
}>> {
  return get<ApiResponse<any>>('/nodes/stats')
}
