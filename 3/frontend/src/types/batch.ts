export interface BatchImportResult {
  totalCount: number
  successCount: number
  failCount: number
  errors: string[]
  elapsedMs: number
}

export interface BatchExportParams {
  sampleCode?: string
  sampleType?: string
  status?: string
  collectionDateStart?: string
  collectionDateEnd?: string
}
