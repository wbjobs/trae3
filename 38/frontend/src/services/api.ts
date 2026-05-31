import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface Entity {
  id: string
  name: string
  type: string
  description?: string
  source_doc?: string
  confidence?: number
}

export interface Relation {
  id: string
  source: string
  target: string
  relation_type: string
  description?: string
  confidence?: number
}

export interface GraphData {
  nodes: Entity[]
  edges: Relation[]
}

export interface ParsedContent {
  doc_id: string
  filename: string
  text_content: string
  images: string[]
  page_count: number
  parsed_at: string
}

export interface ExtractionResult {
  doc_id: string
  entities: Entity[]
  relations: Relation[]
  extracted_at: string
}

export interface UploadResponse {
  doc_id: string
  filename: string
  status: string
  message: string
}

export interface BatchUploadResponse {
  results: UploadResponse[]
  total: number
  success_count: number
  fail_count: number
}

export interface TaskStatus {
  task_id: string
  status: string
  progress: number
  message: string
  result?: any
}

export interface AssociationSuggestion {
  entity_id: string
  entity_name: string
  entity_type: string
  score: number
  reason: string
  suggested_relation?: string
}

export interface NeighborResult {
  entity_id: string
  max_depth: number
  nodes: Entity[]
  edges: Relation[]
  node_count: number
  edge_count: number
}

export interface PathResult {
  found: boolean
  path_nodes: string[]
  path_edges: string[]
  message?: string
}

export interface TypeStat {
  type: string
  count: number
}

export interface CacheStats {
  ai_model: {
    er_cache: { size: number; max_size: number; hits: number; misses: number }
    vision_cache: { size: number; max_size: number; hits: number; misses: number }
    embedding_cache: { size: number; max_size: number; hits: number; misses: number }
  }
  graph_queries: { size: number; max_size: number; hits: number; misses: number }
}

export const api = {
  uploadFile: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post<UploadResponse>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  uploadBatch: (files: File[]) => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    return apiClient.post<BatchUploadResponse>('/upload/batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  extractKnowledge: (docId: string, domain: string = '通用') =>
    apiClient.post(`/extract/${docId}`, null, { params: { domain } }),

  extractBatch: (domain: string = '通用') =>
    apiClient.post('/extract/batch', null, { params: { domain } }),

  getTaskStatus: (taskId: string) =>
    apiClient.get<TaskStatus>(`/task/${taskId}`),

  getFullGraph: () => apiClient.get<GraphData>('/graph'),

  getDocGraph: (docId: string) => apiClient.get<GraphData>(`/graph/${docId}`),

  getParsedContent: (docId: string) =>
    apiClient.get<ParsedContent>(`/parsed/${docId}`),

  getExtraction: (docId: string) =>
    apiClient.get<ExtractionResult>(`/extraction/${docId}`),

  listExtractions: () => apiClient.get<{ extractions: ExtractionResult[] }>('/extractions'),

  updateEntity: (entityId: string, data: Partial<Entity>) =>
    apiClient.put(`/entity/${entityId}`, data),

  updateRelation: (relationId: string, data: Partial<Relation>) =>
    apiClient.put(`/relation/${relationId}`, data),

  deleteEntity: (entityId: string) =>
    apiClient.delete(`/entity/${entityId}`),

  deleteRelation: (relationId: string) =>
    apiClient.delete(`/relation/${relationId}`),

  search: (query: string, nResults: number = 10) =>
    apiClient.post('/search', null, { params: { query, n_results: nResults } }),

  deleteDocument: (docId: string) =>
    apiClient.delete(`/document/${docId}`),

  batchUpdateEntities: (updates: ({ id: string } & Partial<Entity>)[]) =>
    apiClient.post<{ success_count: number; fail_count: number; message: string }>('/entities/batch', { updates }),

  batchUpdateRelations: (updates: ({ id: string } & Partial<Relation>)[]) =>
    apiClient.post<{ success_count: number; fail_count: number; message: string }>('/relations/batch', { updates }),

  getEntitySuggestions: (entityId: string, limit: number = 10, docId?: string) =>
    apiClient.get<{ entity_id: string; suggestions: AssociationSuggestion[]; count: number }>(
      `/entity/${entityId}/suggestions`,
      { params: { limit, doc_id: docId } }
    ),

  suggestAIRelations: (entityId: string, domain: string = '通用', docId?: string) =>
    apiClient.post<{ entity_id: string; entity_name: string; entity_type: string; suggestions: any[] }>(
      `/entity/${entityId}/suggest-relations`,
      null,
      { params: { domain, doc_id: docId } }
    ),

  addRelation: (source: string, target: string, relationType: string, description?: string, confidence?: number) =>
    apiClient.post<{ status: string; relation_id: string; message: string }>('/relation/add', {
      source,
      target,
      relation_type: relationType,
      description,
      confidence,
    }),

  getEntityNeighbors: (entityId: string, maxDepth: number = 1, docId?: string) =>
    apiClient.get<NeighborResult>(`/entity/${entityId}/neighbors`, {
      params: { max_depth: maxDepth, doc_id: docId },
    }),

  getEntityTypes: (docId?: string) =>
    apiClient.get<{ types: TypeStat[]; total: number }>('/stats/entity-types', { params: { doc_id: docId } }),

  getRelationTypes: (docId?: string) =>
    apiClient.get<{ types: TypeStat[]; total: number }>('/stats/relation-types', { params: { doc_id: docId } }),

  findPath: (startId: string, endId: string, maxDepth: number = 3) =>
    apiClient.get<PathResult>('/path/find', { params: { start_id: startId, end_id: endId, max_depth: maxDepth } }),

  getCacheStats: () =>
    apiClient.get<CacheStats>('/cache/stats'),

  clearCache: () =>
    apiClient.post<{ status: string; message: string }>('/cache/clear'),
}
