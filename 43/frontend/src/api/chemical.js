import request from './request'

export function getChemicalList(params) {
  return request({
    url: '/chemicals',
    method: 'get',
    params
  })
}

export function getChemicalDetail(id) {
  return request({
    url: `/chemicals/${id}`,
    method: 'get'
  })
}
