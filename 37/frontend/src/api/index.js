import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

api.interceptors.response.use(
  response => response.data,
  error => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export const deviceApi = {
  getDevices: (params = {}) => api.get('/devices', { params }),
  getDevice: (id) => api.get(`/devices/${id}`),
  getDeviceByCode: (code) => api.get(`/devices/code/${code}`),
  createDevice: (data) => api.post('/devices', data),
  updateDevice: (id, data) => api.put(`/devices/${id}`, data),
  deleteDevice: (id) => api.delete(`/devices/${id}`)
}

export const vibrationApi = {
  getData: (params) => api.get('/vibration/data', { params }),
  createData: (data) => api.post('/vibration/data', data),
  createBatchData: (data) => api.post('/vibration/data/batch', data),
  analyze: (data) => api.post('/vibration/analyze', data),
  detectAnomalies: (data) => api.post('/vibration/detect-anomalies', data),
  getAnalysisResults: (params = {}) => api.get('/vibration/analysis-results', { params })
}

export const anomalyApi = {
  getAnomalies: (params = {}) => api.get('/anomalies', { params }),
  handleAnomaly: (id, data) => api.post(`/anomalies/${id}/handle`, null, { params: data }),
  getStats: (params = {}) => api.get('/anomalies/stats', { params })
}

export const reportApi = {
  getReports: (params = {}) => api.get('/reports', { params }),
  generateReport: (data) => api.post('/reports/generate', data),
  downloadReport: (id) => window.open(`/api/reports/download/${id}`)
}

export const dataCollectionApi = {
  generateHistorical: (params) => api.post('/data-collection/generate-historical', null, { params }),
  generateSample: (params) => api.post('/data-collection/generate-sample', null, { params })
}

export default api
