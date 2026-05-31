import * as sampleRepo from '../repositories/sampleRepository.js'

export function createSample(data: {
  name: string
  type: string
  source?: string
  quantity?: number
  unit?: string
  storage_condition?: string
  lab_id: number
  created_by: number
}) {
  return sampleRepo.create(data)
}

export function getSample(id: number) {
  return sampleRepo.findById(id)
}

export function listSamples(query: sampleRepo.SampleQuery) {
  return sampleRepo.findAll(query)
}

export function updateSampleStatus(id: number, status: string) {
  sampleRepo.updateStatus(id, status)
  return sampleRepo.findById(id)
}
