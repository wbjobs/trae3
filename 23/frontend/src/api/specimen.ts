import request from './request'
import {
  Specimen,
  SpecimenQueryParams,
  SpecimenCreateParams,
  SpecimenUpdateParams,
  PageResult,
  SpecimenImage,
  SpecimenTag,
  SpecimenStatisticsVO
} from '@/types'

export const specimenApi = {
  getList: (params: SpecimenQueryParams) => {
    return request.post<PageResult<Specimen>>('/data/specimen/page', params)
  },

  getById: (id: number) => {
    return request.get<Specimen>(`/data/specimen/${id}`)
  },

  create: (params: SpecimenCreateParams) => {
    return request.post<Specimen>('/data/specimen', params)
  },

  update: (params: SpecimenUpdateParams) => {
    return request.put<Specimen>('/data/specimen', params)
  },

  delete: (id: number) => {
    return request.delete(`/data/specimen/${id}`)
  },

  getStatistics: () => {
    return request.get<SpecimenStatisticsVO>('/data/specimen/statistics')
  },

  getImages: (specimenId: number) => {
    return request.get<SpecimenImage[]>(`/data/specimen/${specimenId}/images`)
  },

  getTags: () => {
    return request.get<SpecimenTag[]>('/data/tag/list')
  },

  batchPreviewUrls: (specimenIds: number[]) => {
    return request.post<Record<number, string>>('/data/specimen/preview-urls', specimenIds)
  }
}

export default specimenApi
