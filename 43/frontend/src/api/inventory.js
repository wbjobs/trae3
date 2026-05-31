import request from './request'

export function getInventoryStats() {
  return request({
    url: '/inventory/stats',
    method: 'get'
  })
}

export function getLowStockList(params) {
  return request({
    url: '/inventory/low-stock',
    method: 'get',
    params
  })
}

export function getStockAlerts() {
  return request({
    url: '/inventory/alerts',
    method: 'get'
  })
}

export function setWarningThreshold(id, data) {
  return request({
    url: `/inventory/${id}/threshold`,
    method: 'put',
    data
  })
}

export function getUsageStats(id, params) {
  return request({
    url: `/inventory/${id}/usage-stats`,
    method: 'get',
    params
  })
}
