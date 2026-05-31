import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from 'element-plus';

const request: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 300000,
});

request.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore();
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      const authStore = useAuthStore();
      authStore.logout();
      ElMessage.error('登录已过期，请重新登录');
      window.location.href = '/login';
    } else {
      ElMessage.error(error.response?.data?.message || error.message || '请求失败');
    }
    return Promise.reject(error);
  }
);

export default request;

export const authApi = {
  login: (data: { username: string; password: string }) =>
    request.post('/auth/login', data),
  logout: () => request.post('/auth/logout'),
  profile: () => request.get('/auth/profile'),
  getUsers: () => request.get('/auth/users'),
  createUser: (data: any) => request.post('/auth/users', data),
  updateUserRole: (id: string, role: string) =>
    request.put(`/auth/users/${id}/role`, { role }),
  deleteUser: (id: string) => request.delete(`/auth/users/${id}`),
};

export const fileParserApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request.post('/file-parser/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getStatus: (id: string) => request.get(`/file-parser/status/${id}`),
  getResult: (id: string) => request.get(`/file-parser/result/${id}`),
};

export const desensitizationApi = {
  process: (data: { text: string; rules?: string[]; mode?: string }) =>
    request.post('/desensitization/process', data),
  processFile: (fileId: string) =>
    request.post(`/desensitization/process-file/${fileId}`),
  getRules: () => request.get('/desensitization/rules'),
  getHistory: (fileId: string) =>
    request.get(`/desensitization/history/${fileId}`),
};

export const vectorApi = {
  embed: (data: { text: string; documentId: string; metadata?: any }) =>
    request.post('/vector-embedding/embed', data),
  search: (data: {
    query: string;
    topK?: number;
    threshold?: number;
    documentIds?: string[];
  }) => request.post('/vector-embedding/search', data),
  deleteIndex: (documentId: string) =>
    request.delete(`/vector-embedding/index/${documentId}`),
  getStats: () => request.get('/vector-embedding/stats'),
};

export const qaApi = {
  ask: (data: {
    question: string;
    conversationId?: string;
    documentIds?: string[];
    topK?: number;
  }) => request.post('/ai-qa/ask', data),
  askStream: (data: {
    question: string;
    conversationId?: string;
    documentIds?: string[];
  }) => request.post('/ai-qa/ask-stream', data, { responseType: 'stream' }),
  getConversations: () => request.get('/ai-qa/conversations'),
  getConversation: (id: string) => request.get(`/ai-qa/conversations/${id}`),
  deleteConversation: (id: string) =>
    request.delete(`/ai-qa/conversations/${id}`),
};

export const storageApi = {
  upload: (file: File, metadata: any) => {
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(metadata).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        formData.append(k, String(v));
      }
    });
    return request.post('/storage/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getFiles: (params?: any) => request.get('/storage/files', { params }),
  getFile: (id: string) => request.get(`/storage/files/${id}`),
  downloadFile: (id: string) =>
    request.get(`/storage/files/${id}/download`, { responseType: 'blob' }),
  downloadDesensitized: (id: string) =>
    request.get(`/storage/files/${id}/desensitized`, { responseType: 'blob' }),
  deleteFile: (id: string) => request.delete(`/storage/files/${id}`),
};

export const pipelineApi = {
  uploadAndProcess: (file: File, metadata: any) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('department', metadata.department);
    formData.append('classification', metadata.classification);
    if (metadata.tags) formData.append('tags', metadata.tags);
    return request.post('/pipeline/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getStatus: (fileId: string) =>
    request.get(`/pipeline/status/${fileId}`),
};
