const API_BASE = import.meta.env.VITE_API_BASE || ''
const API_TIMEOUT = 120000

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json; charset=utf-8'
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    })
    if (res.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.detail || `Request failed: ${res.status}`)
    }
    return res.json()
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接或联系管理员')
    }
    throw e
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function loginApi(username: string, password: string) {
  return request<{ access_token: string; token_type: string; user: { id: string; username: string; role: 'admin' | 'user'; is_active: boolean; created_at: string } }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function getMeApi() {
  return request<{ id: string; username: string; role: 'admin' | 'user'; is_active: boolean; created_at: string }>('/api/auth/me')
}

export async function changePasswordApi(old_password: string, new_password: string) {
  return request<{ message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ old_password, new_password }),
  })
}

export async function uploadDocumentApi(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request<{ id: string; filename: string; file_type: string; file_size: number; status: string; chunk_count: number; created_at: string }>('/api/documents/upload', {
    method: 'POST',
    body: formData,
  })
}

export async function listDocumentsApi(page = 1, pageSize = 20, keyword?: string) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (keyword) params.set('keyword', keyword)
  return request<{ items: { id: string; filename: string; file_type: string; file_size: number; status: string; chunk_count: number; created_at: string }[]; total: number }>(`/api/documents?${params}`)
}

export async function getDocumentApi(id: string) {
  return request<{ id: string; filename: string; file_type: string; file_size: number; status: string; chunk_count: number; created_at: string; chunks: { id: string; content: string; page_number: number | null; token_count: number }[] }>(`/api/documents/${id}`)
}

export async function deleteDocumentApi(id: string) {
  return request<{ message: string }>(`/api/documents/${id}`, { method: 'DELETE' })
}

export async function reparseDocumentApi(id: string) {
  return request<{ message: string; status: string }>(`/api/documents/${id}/reparse`, { method: 'POST' })
}

export async function searchApi(query: string, topK = 5, threshold = 0.3) {
  return request<{ results: { chunk_id: string; document_id: string; filename: string; content: string; score: number; page_number: number | null }[] }>('/api/search', {
    method: 'POST',
    body: JSON.stringify({ query, top_k: topK, threshold }),
  })
}

export async function getSearchHistoryApi(page = 1, pageSize = 20) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return request<{ items: { id: string; query: string; result_count: number; created_at: string }[]; total: number }>(`/api/search/history?${params}`)
}

export async function getConversationsApi() {
  return request<{ id: string; title: string; created_at: string; updated_at: string }[]>('/api/chat/conversations')
}

export async function getConversationMessagesApi(conversationId: string) {
  return request<{ id: string; role: string; content: string; sources: { chunk_id: string; document_id: string; filename: string; content: string; page_number: number | null; score: number }[] | null; created_at: string }[]>(`/api/chat/conversations/${conversationId}`)
}

export async function deleteConversationApi(conversationId: string) {
  return request<{ message: string }>(`/api/chat/conversations/${conversationId}`, { method: 'DELETE' })
}

export async function getStatsApi() {
  return request<{ document_count: number; vector_count: number; query_count: number; active_users: number }>('/api/stats/overview')
}

export async function listUsersApi(page = 1, pageSize = 20) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  return request<{ items: { id: string; username: string; role: string; is_active: boolean; created_at: string }[]; total: number }>(`/api/users?${params}`)
}

export async function createUserApi(username: string, password: string, role: string) {
  return request<{ id: string; username: string; role: string; is_active: boolean; created_at: string }>('/api/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, role }),
  })
}

export async function updateUserApi(userId: string, data: { username?: string; role?: string; is_active?: boolean }) {
  return request<{ id: string; username: string; role: string; is_active: boolean; created_at: string }>(`/api/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteUserApi(userId: string) {
  return request<{ message: string }>(`/api/users/${userId}`, { method: 'DELETE' })
}

export function getChatStreamUrl() {
  return `${API_BASE}/api/chat`
}

export function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  }
}
