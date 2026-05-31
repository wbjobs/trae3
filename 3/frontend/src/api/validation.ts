import axiosInstance from './axios'

export interface ValidationResult {
  valid: boolean
  fieldName: string
  errorMessage?: string
  ruleCode?: string
}

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export const validateField = (fieldName: string, fieldValue: any): Promise<ApiResponse<ValidationResult[]>> => {
  return axiosInstance.post('/validation/field', { fieldName, fieldValue })
}

export const batchValidate = (sampleCode: string, fields: Record<string, any>): Promise<ApiResponse<any>> => {
  return axiosInstance.post('/validation/batch', { sampleCode, fields })
}

export const getValidationRules = (): Promise<ApiResponse<any[]>> => {
  return axiosInstance.get('/validation/rules')
}

export const createValidationRule = (rule: any): Promise<ApiResponse<any>> => {
  return axiosInstance.post('/validation/rule', rule)
}

export const updateValidationRule = (rule: any): Promise<ApiResponse<any>> => {
  return axiosInstance.put('/validation/rule', rule)
}
