import request from './request'
import {
  Annotation,
  AnnotationCreateParams,
  AnnotationBatchCreateParams,
  AnnotationQueryParams,
  PageResult
} from '@/types'

export const annotationApi = {
  getList: (params: AnnotationQueryParams) => {
    return request.post<PageResult<Annotation>>('/data/annotation/page', params)
  },

  getById: (id: number) => {
    return request.get<Annotation>(`/data/annotation/${id}`)
  },

  listByImageId: (imageId: number) => {
    return request.get<Annotation[]>(`/data/annotation/list/${imageId}`)
  },

  create: (params: AnnotationCreateParams) => {
    return request.post<Annotation>('/data/annotation', params)
  },

  batchCreate: (params: AnnotationBatchCreateParams) => {
    return request.post<Annotation[]>('/data/annotation/batch', params)
  },

  delete: (id: number) => {
    return request.delete(`/data/annotation/${id}`)
  },

  exportAnnotations: (specimenIds: number[], format: string = 'excel') => {
    return request.post('/data/annotation/export', {
      specimenIds,
      format
    }, { responseType: 'blob' } as any)
  },

  acquireLock: (specimenId: number, imageId: number) => {
    return request.post<boolean>('/data/annotation/lock', { specimenId, imageId })
  },

  releaseLock: (specimenId: number, imageId: number) => {
    return request.post('/data/annotation/unlock', { specimenId, imageId })
  }
}

export default annotationApi
