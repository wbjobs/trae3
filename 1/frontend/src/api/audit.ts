import { get } from '@/utils/request'
import type { AuditLog, TraceSpan, PageQuery, PageResult, ApiResponse } from '@/types'

export function getAuditLogs(params: any): Promise<ApiResponse<PageResult<AuditLog>>> {
  return get<ApiResponse<PageResult<AuditLog>>>('/audit/logs', params)
}

export function getTraceDetail(traceId: string): Promise<ApiResponse<TraceSpan[]>> {
  return get<ApiResponse<TraceSpan[]>>(`/audit/trace/${traceId}`)
}

export function getAuditStats(): Promise<ApiResponse<{
  todayTotal: number
  todaySuccess: number
  todayFailed: number
  totalTraces: number
}>> {
  return get<ApiResponse<{
    todayTotal: number
    todaySuccess: number
    todayFailed: number
    totalTraces: number
  }>>('/audit/stats')
}
