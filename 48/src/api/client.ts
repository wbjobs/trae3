import type { InspectionResult, DefectRecord, SummaryData, DistributionData, TrendData, DefectType, DefectUpdate, SystemStats } from "@/types"

const API_BASE = "/api"

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, options)
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function uploadImages(files: File[]): Promise<{ task_id: string; status: string }> {
  const formData = new FormData()
  files.forEach((file) => formData.append("files", file))
  return fetchJSON("/inspections/upload", {
    method: "POST",
    body: formData,
  })
}

export async function getInspection(taskId: string): Promise<InspectionResult> {
  return fetchJSON(`/inspections/${taskId}`)
}

export async function getInspections(params: {
  page?: number
  page_size?: number
  status?: string
  defect_type?: string
}): Promise<{ items: InspectionResult[]; total: number }> {
  const query = new URLSearchParams()
  if (params.page) query.set("page", String(params.page))
  if (params.page_size) query.set("page_size", String(params.page_size))
  if (params.status) query.set("status", params.status)
  if (params.defect_type) query.set("defect_type", params.defect_type)
  return fetchJSON(`/inspections?${query.toString()}`)
}

export async function downloadSingleReport(inspectionId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/inspections/${inspectionId}/report`)
  if (!res.ok) throw new Error(`Failed to download report: ${res.status}`)
  return res.blob()
}

export async function downloadBatchReport(inspectionIds: string[]): Promise<Blob> {
  const res = await fetch(`${API_BASE}/inspections/batch-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inspection_ids: inspectionIds }),
  })
  if (!res.ok) throw new Error(`Failed to download batch report: ${res.status}`)
  return res.blob()
}

export async function getSystemStats(): Promise<SystemStats> {
  return fetchJSON("/inspections/stats/overview")
}

export async function getDefects(params: {
  page?: number
  page_size?: number
  type?: string
  severity?: string
  confirmed?: boolean
}): Promise<{ items: DefectRecord[]; total: number }> {
  const query = new URLSearchParams()
  if (params.page) query.set("page", String(params.page))
  if (params.page_size) query.set("page_size", String(params.page_size))
  if (params.type) query.set("type", params.type)
  if (params.severity) query.set("severity", params.severity)
  if (params.confirmed !== undefined) query.set("confirmed", String(params.confirmed))
  return fetchJSON(`/defects?${query.toString()}`)
}

export async function getDefect(id: string): Promise<DefectRecord> {
  return fetchJSON(`/defects/${id}`)
}

export async function confirmDefect(id: string, confirmed: boolean, note: string): Promise<DefectRecord> {
  return fetchJSON(`/defects/${id}/confirm`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed, note }),
  })
}

export async function updateDefect(id: string, update: DefectUpdate): Promise<DefectRecord> {
  return fetchJSON(`/defects/${id}/annotation`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  })
}

export async function redrawDefectAnnotation(id: string): Promise<{ image_base64: string; defect_id: string }> {
  return fetchJSON(`/defects/${id}/redraw`, {
    method: "POST",
  })
}

export async function addDefectToInspection(inspectionId: string, defect: DefectUpdate & { type: string }): Promise<DefectRecord> {
  return fetchJSON(`/defects/add-to-inspection/${inspectionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(defect),
  })
}

export async function searchDefects(query: string, topK: number = 10): Promise<{ results: DefectRecord[] }> {
  return fetchJSON("/defects/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  })
}

export async function searchDefectsByImage(file: File, topK: number = 10): Promise<{ results: DefectRecord[] }> {
  const formData = new FormData()
  formData.append("image_file", file)
  formData.append("top_k", String(topK))
  return fetchJSON("/defects/search", {
    method: "POST",
    body: formData,
  })
}

export async function getDefectTypes(): Promise<DefectType[]> {
  return fetchJSON("/defect-types")
}

export async function getDistribution(params: {
  group_by?: string
  start_date?: string
  end_date?: string
}): Promise<DistributionData> {
  const query = new URLSearchParams()
  if (params.group_by) query.set("group_by", params.group_by)
  if (params.start_date) query.set("start_date", params.start_date)
  if (params.end_date) query.set("end_date", params.end_date)
  return fetchJSON(`/analytics/distribution?${query.toString()}`)
}

export async function getTrend(params: {
  granularity?: string
  start_date?: string
  end_date?: string
}): Promise<TrendData> {
  const query = new URLSearchParams()
  if (params.granularity) query.set("granularity", params.granularity)
  if (params.start_date) query.set("start_date", params.start_date)
  if (params.end_date) query.set("end_date", params.end_date)
  return fetchJSON(`/analytics/trend?${query.toString()}`)
}

export async function getSummary(): Promise<SummaryData> {
  return fetchJSON("/analytics/summary")
}
