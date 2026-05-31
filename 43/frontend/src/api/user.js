import request from './request'

export function getUserList(params) {
  return request({
    url: '/users',
    method: 'get',
    params
  })
}

export function createUser(data) {
  return request({
    url: '/users',
    method: 'post',
    data
  })
}

export function updateUser(id, data) {
  return request({
    url: `/users/${id}`,
    method: 'put',
    data
  })
}

export function deleteUser(id) {
  return request({
    url: `/users/${id}`,
    method: 'delete'
  })
}

export function resetPassword(id, password = '123456') {
  return request({
    url: `/users/${id}/reset-password`,
    method: 'put',
    data: { password }
  })
}

export function getRoleList() {
  return request({
    url: '/roles',
    method: 'get'
  })
}
