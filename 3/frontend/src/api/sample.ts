import axiosInstance from './axios'
import { SampleMetadata, SampleQueryRequest } from '../types'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface PageResult<T> {
  content: T[]
  totalElements: number
  totalPages: number
  size: number
  number: number
}

export const createSample = (sample: any): Promise<ApiResponse<SampleMetadata>> => {
  return axiosInstance.post('/samples', sample).then(res => res.data)
}

export const updateSample = (sample: any): Promise<ApiResponse<SampleMetadata>> => {
  return axiosInstance.put(`/samples/${sample.id}`, sample).then(res => res.data)
}

export const deleteSample = (id: number): Promise<ApiResponse<void>> => {
  return axiosInstance.delete(`/samples/${id}`).then(res => res.data)
}

export const getSampleById = (id: number): Promise<ApiResponse<SampleMetadata>> => {
  return axiosInstance.get(`/samples/${id}`).then(res => res.data)
}

export const querySamples = (params: SampleQueryRequest): Promise<ApiResponse<PageResult<SampleMetadata>>> => {
  return axiosInstance.get('/samples/query', { params }).then(res => res.data)
}

export const crossDeptQuery = (params: SampleQueryRequest, targetTenantId: number): Promise<ApiResponse<PageResult<SampleMetadata>>> => {
  return axiosInstance.get('/samples/cross-dept', { params: { ...params, targetTenantId } }).then(res => res.data)
}
