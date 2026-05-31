export interface User {
  id: number
  username: string
  nickname?: string
  email?: string
  roles: string[]
  tenantId: number
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface SampleMetadata {
  id?: number
  sampleId: string
  name: string
  type: string
  department: string
  status: string
  description?: string
  createTime?: string
  updateTime?: string
  createBy?: number
  tenantId?: number
}

export interface SampleQueryRequest {
  sampleId?: string
  name?: string
  type?: string
  department?: string
  status?: string
  pageNum?: number
  pageSize?: number
}

export interface ValidationRule {
  id?: number
  fieldName: string
  ruleType: string
  ruleValue: string
  errorMessage: string
  enabled: boolean
  tenantId?: number
}

export interface ValidationRequest {
  fieldName: string
  fieldValue: string
}

export interface ValidationResult {
  valid: boolean
  errorMessage?: string
  fieldName: string
}

export interface BatchValidationRequest {
  validations: ValidationRequest[]
}

export interface BatchValidationResult {
  results: ValidationResult[]
  allValid: boolean
}

export interface Attachment {
  id?: number
  sampleId: number
  fileName: string
  fileSize: number
  contentType: string
  storagePath: string
  uploadTime?: string
  uploadBy?: number
  tenantId?: number
}

export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

export interface PageResult<T> {
  list: T[]
  total: number
  pageNum: number
  pageSize: number
}
