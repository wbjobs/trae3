import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

api.interceptors.response.use(
  response => response.data,
  error => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export const deviceApi = {
  getAll: () => api.get('/device'),
  getById: (id) => api.get(`/device/${id}`),
  getByType: (type) => api.get(`/device/type/${type}`),
  create: (data) => api.post('/device', data),
  updateStatus: (id, status) => api.put(`/device/${id}/status`, { status }),
  delete: (id) => api.delete(`/device/${id}`),
  getSignalLatest: (id, limit = 1) => api.get(`/device/${id}/signal/latest?limit=${limit}`),
  getSignalHistory: (id, start, end) => api.get(`/device/${id}/signal/history?start_time=${start}&end_time=${end}`),
  getSignalAggregated: (id, start, end, interval = '5m') => api.get(`/device/${id}/signal/aggregated?start_time=${start}&end_time=${end}&interval=${interval}`)
}

export const signalApi = {
  getLatest: () => api.get('/signal/latest'),
  getByDevice: (deviceId, limit = 10) => api.get(`/signal/device/${deviceId}?limit=${limit}`)
}

export const topologyApi = {
  getTopology: () => api.get('/topology'),
  getSummary: () => api.get('/topology/summary'),
  getTree: () => api.get('/topology/tree')
}

export const alertApi = {
  getAll: (limit = 100) => api.get(`/alert?limit=${limit}`),
  getActive: () => api.get('/alert/active'),
  getByDevice: (deviceId, limit = 50) => api.get(`/alert/device/${deviceId}?limit=${limit}`),
  getBySeverity: (severity, limit = 50) => api.get(`/alert/severity/${severity}?limit=${limit}`),
  getStats: () => api.get('/alert/stats'),
  create: (data) => api.post('/alert', data),
  resolve: (id) => api.put(`/alert/${id}/resolve`),
  delete: (id) => api.delete(`/alert/${id}`)
}

export const strategyApi = {
  getAll: () => api.get('/strategy'),
  getEnabled: () => api.get('/strategy/enabled'),
  getById: (id) => api.get(`/strategy/${id}`),
  create: (data) => api.post('/strategy', data),
  update: (id, data) => api.put(`/strategy/${id}`, data),
  toggle: (id, enabled) => api.put(`/strategy/${id}/toggle`, { enabled }),
  delete: (id) => api.delete(`/strategy/${id}`),
  getExecutions: (id, limit = 50) => api.get(`/strategy/${id}/executions?limit=${limit}`)
}

export default api
