import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

api.interceptors.response.use(
  response => {
    const res = response.data;
    if (res.code !== undefined && res.code !== 200) {
      console.error(`API Error: ${res.message || '请求失败'}`);
      return Promise.reject(new Error(res.message || '请求失败'));
    }
    return res.data !== undefined ? res.data : res;
  },
  error => {
    console.error('Request Error:', error.message);
    if (error.response) {
      const { status, data } = error.response;
      if (status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
      return Promise.reject(new Error(data?.message || `HTTP Error: ${status}`));
    }
    return Promise.reject(error);
  }
);

const createCRUD = (basePath) => ({
  getAll: (params = {}) => api.get(basePath, { params }),
  getById: (id) => api.get(`${basePath}/${id}`),
  getByIds: (ids) => api.post(`${basePath}/ids`, { ids }),
  create: (data) => api.post(basePath, data),
  createBatch: (items) => api.post(`${basePath}/batch`, items),
  update: (id, data) => api.put(`${basePath}/${id}`, data),
  delete: (id) => api.delete(`${basePath}/${id}`),
  deleteBatch: (ids) => api.delete(`${basePath}/batch`, { data: { ids } }),
  count: () => api.get(`${basePath}/count`),
  search: (name) => api.get(`${basePath}/search`, { params: { name } })
});

const tunnels = {
  ...createCRUD('/tunnels'),
  getDetail: (tunnelId) => api.get(`/data/tunnel/${tunnelId}/detail`)
};

const pipes = {
  ...createCRUD('/pipes'),
  getByTunnelId: (tunnelId) => api.get(`/pipes/tunnel/${tunnelId}`),
  getByTunnelIds: (tunnelIds) => api.post('/pipes/tunnels', { tunnelIds })
};

const fans = {
  ...createCRUD('/fans'),
  getByTunnelId: (tunnelId) => api.get(`/fans/tunnel/${tunnelId}`),
  getByPipeId: (pipeId) => api.get(`/fans/pipe/${pipeId}`),
  getByTunnelIds: (tunnelIds) => api.post('/fans/tunnels', { tunnelIds })
};

const annotations = {
  ...createCRUD('/annotations'),
  getByTunnelId: (tunnelId) => api.get(`/annotations/tunnel/${tunnelId}`),
  getByPipeId: (pipeId) => api.get(`/annotations/pipe/${pipeId}`),
  getByFanId: (fanId) => api.get(`/annotations/fan/${fanId}`),
  getByTunnelIds: (tunnelIds) => api.post('/annotations/tunnels', { tunnelIds }),
  getByType: (type) => api.get(`/annotations/type/${type}`),
  getByStatus: (status) => api.get(`/annotations/status/${status}`)
};

const data = {
  getSummary: () => api.get('/data/summary'),
  getAll: () => api.get('/data/all'),
  getTunnelDetail: (tunnelId) => api.get(`/data/tunnel/${tunnelId}/detail`),
  importAll: (importData) => api.post('/data/import', importData),
  exportByTunnelIds: (tunnelIds) => api.post('/data/export/by-tunnels', { tunnelIds })
};

export {
  api as default,
  tunnels,
  pipes,
  fans,
  annotations,
  data
};
