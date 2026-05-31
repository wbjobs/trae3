export interface UserInfo {
  id: string
  username: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: UserInfo
}

export interface DocumentInfo {
  id: string
  filename: string
  file_type: string
  file_size: number
  status: 'uploading' | 'parsing' | 'completed' | 'failed'
  chunk_count: number
  created_at: string
}

export interface ChunkInfo {
  id: string
  content: string
  page_number: number | null
  token_count: number
}

export interface DocumentDetail extends DocumentInfo {
  chunks: ChunkInfo[]
}

export interface SearchRequest {
  query: string
  top_k?: number
  threshold?: number
}

export interface SearchResult {
  chunk_id: string
  document_id: string
  filename: string
  content: string
  score: number
  page_number: number | null
}

export interface SearchHistory {
  id: string
  query: string
  result_count: number
  created_at: string
}

export interface Source {
  chunk_id: string
  document_id: string
  filename: string
  content: string
  page_number: number | null
  score: number
}

export interface ChatRequest {
  question: string
  conversation_id?: string
}

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  created_at: string
}

export interface StatsOverview {
  document_count: number
  vector_count: number
  query_count: number
  active_users: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
}

export interface CreateUserRequest {
  username: string
  password: string
  role: 'admin' | 'user'
}

export interface UpdateUserRequest {
  username?: string
  role?: 'admin' | 'user'
  is_active?: boolean
}
