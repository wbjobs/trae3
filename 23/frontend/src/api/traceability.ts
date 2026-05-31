import request from './request'
import {
  TraceabilityRecord,
  TraceabilityQueryParams,
  TraceabilityChain,
  TraceabilitySearchParams,
  QrCode,
  SearchResult,
  PageResult
} from '@/types'

export const traceabilityApi = {
  getRecords: (params: TraceabilityQueryParams) => {
    return request.post<PageResult<TraceabilityRecord>>('/traceability/record/page', params)
  },

  getRecordById: (id: number) => {
    return request.get<TraceabilityRecord>(`/traceability/record/${id}`)
  },

  getChain: (specimenId: number) => {
    return request.get<TraceabilityChain>(`/traceability/record/chain/${specimenId}`)
  },

  addRecord: (record: Partial<TraceabilityRecord>) => {
    return request.post('/traceability/record', record)
  },

  search: (params: TraceabilitySearchParams) => {
    return request.post<{ total: number; list: SearchResult[]; pageNum: number; pageSize: number }>('/traceability/search', params)
  },

  syncIndex: (specimenId: number) => {
    return request.post(`/traceability/search/sync/${specimenId}`)
  },

  syncAllIndex: () => {
    return request.post('/traceability/search/sync/all')
  },

  generateQrCode: (specimenId: number, width?: number, height?: number) => {
    return request.post<QrCode>('/traceability/qrcode/generate', {
      specimenId,
      width: width || 300,
      height: height || 300,
      format: 'PNG'
    })
  },

  getQrCodeBySpecimenId: (specimenId: number) => {
    return request.get<QrCode>(`/traceability/qrcode/specimen/${specimenId}`)
  },

  getQrCodeById: (id: number) => {
    return request.get<QrCode>(`/traceability/qrcode/${id}`)
  },

  getQrCodeImage: (id: number) => {
    return `/traceability/qrcode/image/${id}`
  },

  recordScan: (qrCodeId: number, scannerIp?: string) => {
    return request.post('/traceability/qrcode/scan', {
      qrCodeId,
      scannerIp,
      scanTime: new Date().toISOString()
    })
  }
}

export default traceabilityApi
