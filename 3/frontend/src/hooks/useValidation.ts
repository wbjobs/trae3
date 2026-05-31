import { validateField as validateFieldApi, batchValidate } from '../api/validation'

export const useValidation = () => {
  const validateField = async (fieldName: string, fieldValue: any): Promise<string | null> => {
    try {
      const response = await validateFieldApi(fieldName, fieldValue)
      const results = response.data
      const invalidResults = results.filter((r: any) => !r.valid)
      if (invalidResults.length > 0) {
        return invalidResults.map((r: any) => r.errorMessage).join(', ')
      }
      return null
    } catch (error) {
      console.error('Validation error:', error)
      return null
    }
  }

  const validateBatch = async (sampleCode: string, fields: Record<string, any>) => {
    try {
      const response = await batchValidate(sampleCode, fields)
      return response.data
    } catch (error) {
      console.error('Batch validation error:', error)
      return { valid: false, results: [], totalErrors: 0 }
    }
  }

  return {
    validateField,
    validateBatch,
  }
}
