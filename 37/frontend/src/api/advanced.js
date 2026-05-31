import request from './axios'

export const advancedApi = {
  predictFault(params) {
    return request.post('/api/advanced/predict', params)
  },

  predictEnsemble(params) {
    return request.post('/api/advanced/predict/ensemble', params)
  },

  runArchive(params) {
    return request.post('/api/advanced/archive/run', params)
  },

  getArchiveStats(deviceCode) {
    return request.get('/api/advanced/archive/stats', {
      params: deviceCode ? { device_code: deviceCode } : {}
    })
  },

  restoreFromCold(params) {
    return request.post('/api/advanced/archive/restore', null, { params })
  },

  getStreamingStats() {
    return request.get('/api/advanced/streaming/stats')
  },

  processStreamingData(dataPoints) {
    return request.post('/api/advanced/streaming/process', dataPoints)
  },

  getAggregations(params) {
    return request.get('/api/advanced/aggregations', { params })
  },

  queryHotAndCold(params) {
    return request.get('/api/advanced/query/combined', { params })
  },

  getMethods() {
    return request.get('/api/advanced/methods')
  }
}

export default advancedApi
