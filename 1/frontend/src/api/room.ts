import { get, post } from '@/utils/request'
import type { RoomInfo, PageQuery, PageResult, ApiResponse, RoomFilter } from '@/types'

export function getRoomList(params: PageQuery & RoomFilter): Promise<ApiResponse<PageResult<RoomInfo>>> {
  return get<ApiResponse<PageResult<RoomInfo>>>('/rooms', params)
}

export function getRoomDetail(id: string): Promise<ApiResponse<RoomInfo>> {
  return get<ApiResponse<RoomInfo>>(`/rooms/${id}`)
}

export function getRoomNodes(id: string): Promise<ApiResponse<any[]>> {
  return get<ApiResponse<any[]>>(`/rooms/${id}/nodes`)
}

export function getRoomTree(): Promise<ApiResponse<RoomInfo[]>> {
  return get<ApiResponse<RoomInfo[]>>('/rooms/tree')
}

export function getRoomStats(): Promise<ApiResponse<{
  total: number
  active: number
  maintenance: number
  offline: number
}>> {
  return get<ApiResponse<any>>('/rooms/stats')
}

export function batchControlNodes(roomId: string, action: 'start' | 'pause'): Promise<ApiResponse<any>> {
  return post<ApiResponse<any>>(`/rooms/${roomId}/nodes/batch-control`, { action })
}

export function getRegions(): Promise<ApiResponse<{ code: string; name: string }[]>> {
  return get<ApiResponse<{ code: string; name: string }[]>>('/rooms/regions')
}
