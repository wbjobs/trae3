import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000
});

export const archiveAPI = {
  create: (data) => api.post('/archives', data),
  list: (params) => api.get('/archives', { params }),
  get: (id) => api.get(`/archives/${id}`),
  update: (id, data) => api.put(`/archives/${id}`, data),
  delete: (id) => api.delete(`/archives/${id}`),
  generateNumber: (category) => api.get('/archives/number/generate', { params: { category } }),
  analyze: (data) => api.post('/archives/analyze', data)
};

export const fileAPI = {
  upload: (archiveId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/files/${archiveId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  download: (archiveId) => window.open(`${API_BASE_URL}/files/${archiveId}/download`),
  preview: (archiveId) => `${API_BASE_URL}/files/${archiveId}/preview`,
  delete: (archiveId) => api.delete(`/files/${archiveId}`)
};

export const importAPI = {
  upload: (file, createdBy = '系统') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('createdBy', createdBy);
    return api.post('/import/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  confirm: (taskId, createdBy = '系统') => 
    api.post(`/import/confirm/${taskId}`, { createdBy }),
  getTasks: (params) => api.get('/import/tasks', { params }),
  downloadTemplate: () => window.open(`${API_BASE_URL}/import/template`)
};

export const reviewAPI = {
  list: (params) => api.get('/review', { params }),
  submit: (id, operator = '系统') => 
    api.post(`/review/${id}/submit`, { operator }),
  approve: (id, reviewer = '审核员', comment = '') => 
    api.post(`/review/${id}/approve`, { reviewer, comment }),
  reject: (id, reviewer = '审核员', comment = '') => 
    api.post(`/review/${id}/reject`, { reviewer, comment }),
  archive: (id, operator = '系统') => 
    api.post(`/review/${id}/archive`, { operator }),
  getLogs: (id) => api.get(`/review/${id}/logs`),
  getStats: () => api.get('/review/stats'),
  batchApprove: (ids, reviewer = '审核员', comment = '') => 
    api.post('/review/batch/approve', { ids, reviewer, comment })
};

export default api;
