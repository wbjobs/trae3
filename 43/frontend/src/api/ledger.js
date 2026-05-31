import request from './request'

export function getLedgerList(params) {
  return request({
    url: '/ledger',
    method: 'get',
    params
  })
}

export function getLedgerDetail(id) {
  return request({
    url: `/ledger/${id}`,
    method: 'get'
  })
}

export function getLedgerApprovalFlow(id) {
  return request({
    url: `/ledger/${id}/approval-flow`,
    method: 'get'
  })
}

export function getLedgerTraceLogs(id) {
  return request({
    url: `/ledger/${id}/trace-logs`,
    method: 'get'
  })
}

export function getLedgerTraceChain(id) {
  return request({
    url: `/ledger/${id}/trace-chain`,
    method: 'get'
  })
}

export function exportLedger(params) {
  return request({
    url: '/ledger/export',
    method: 'get',
    params,
    responseType: 'blob'
  })
}

export function getLedgerStats(params) {
  return request({
    url: '/ledger/stats',
    method: 'get',
    params
  })
}

export function getDangerLevelStats(params) {
  return request({
    url: '/ledger/stats/danger-level',
    method: 'get',
    params
  })
}

export function getMonthlyTrendStats(params) {
  return request({
    url: '/ledger/stats/monthly-trend',
    method: 'get',
    params
  })
}
