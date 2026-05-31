import request from './request'

export function createApplication(data) {
  return request({
    url: '/applications',
    method: 'post',
    data
  })
}

export function submitApplication(id) {
  return request({
    url: `/applications/${id}/submit`,
    method: 'put'
  })
}

export function getApplicationList(params) {
  return request({
    url: '/applications',
    method: 'get',
    params
  })
}

export function getApplicationDetail(id) {
  return request({
    url: `/applications/${id}`,
    method: 'get'
  })
}

export function cancelApplication(id) {
  return request({
    url: `/applications/${id}/cancel`,
    method: 'put'
  })
}

export function approveApplication(id, data) {
  return request({
    url: `/applications/approvals/${id}/approve`,
    method: 'put',
    data
  })
}

export function rejectApplication(id, data) {
  return request({
    url: `/applications/approvals/${id}/reject`,
    method: 'put',
    data
  })
}

export function distributeApplication(id) {
  return request({
    url: `/applications/approvals/${id}/distribute`,
    method: 'put'
  })
}

export function getPendingApprovalList() {
  return request({
    url: '/applications/approvals/pending',
    method: 'get'
  })
}
