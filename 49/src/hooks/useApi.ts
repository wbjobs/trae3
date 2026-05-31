import type {
  PipeNode,
  PipeSegment,
  RealtimeData,
  AlarmRecord,
  InspectionPath,
  Annotation,
  CollaborationUser,
  CrossSectionData,
  PlannedPath,
  PathPlanningParams,
} from '../../shared/types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  const json = await res.json()
  return (json.data ?? json) as T
}

export function useApi() {
  const fetchPipes = () =>
    request<PipeSegment[]>('/api/pipes')

  const fetchNodes = () =>
    request<PipeNode[]>('/api/nodes')

  const fetchPipeRealtime = (id: string) =>
    request<RealtimeData>(`/api/pipes/${id}/realtime`)

  const fetchPipeHistory = (id: string, range: string) =>
    request<RealtimeData[]>(`/api/pipes/${id}/history?range=${range}`)

  const fetchAlarms = (acknowledged?: boolean) => {
    const params = acknowledged !== undefined ? `?acknowledged=${acknowledged}` : ''
    return request<AlarmRecord[]>(`/api/alarms${params}`)
  }

  const acknowledgeAlarm = (id: string, userId: string) =>
    request<AlarmRecord>(`/api/alarms/${id}/acknowledge`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })

  const fetchInspections = () =>
    request<InspectionPath[]>('/api/inspections')

  const createInspection = (path: Omit<InspectionPath, 'id'>) =>
    request<InspectionPath>('/api/inspections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(path),
    })

  const fetchAnnotations = (pipeId: string) =>
    request<Annotation[]>(`/api/annotations?pipeId=${pipeId}`)

  const createAnnotation = (annotation: Omit<Annotation, 'id'>) =>
    request<Annotation>('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annotation),
    })

  const fetchOnlineUsers = () =>
    request<CollaborationUser[]>('/api/collab/users')

  const fetchCrossSection = (pipeId: string) =>
    request<CrossSectionData>(`/api/pipes/${pipeId}/cross-section`)

  const planPath = (params: PathPlanningParams) =>
    request<PlannedPath>('/api/path-planning/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

  return {
    fetchPipes,
    fetchNodes,
    fetchPipeRealtime,
    fetchPipeHistory,
    fetchAlarms,
    acknowledgeAlarm,
    fetchInspections,
    createInspection,
    fetchAnnotations,
    createAnnotation,
    fetchOnlineUsers,
    fetchCrossSection,
    planPath,
  }
}
