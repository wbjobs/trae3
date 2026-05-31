import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  PipeNode,
  PipeSegment,
  RealtimeData,
  AlarmRecord,
  Annotation,
  InspectionPath,
  CollaborationUser,
  CrossSectionData,
  PlannedPath,
} from '../../shared/types'

const COLOR_PALETTE = [
  '#e6194b',
  '#3cb44b',
  '#ffe119',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#bfef45',
  '#fabed4',
  '#469990',
  '#dcbeff',
  '#9A6324',
  '#800000',
  '#aaffc3',
  '#808000',
  '#ffd8b1',
  '#000075',
  '#a9a9a9',
]

function generateCurrentUser(): CollaborationUser {
  const id = uuidv4()
  const color = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]
  const num = Math.floor(Math.random() * 999) + 1
  const name = `工程师-${String(num).padStart(3, '0')}`
  return { id, name, role: 'engineer', color }
}

interface PipelineState {
  pipes: PipeSegment[]
  nodes: PipeNode[]
  selectedPipeId: string | null
  realtimeData: Map<string, RealtimeData>
  alarms: AlarmRecord[]
  annotations: Annotation[]
  inspectionPaths: InspectionPath[]
  onlineUsers: CollaborationUser[]
  currentUser: CollaborationUser | null
  isLoading: boolean
  performanceMode: boolean
  disableHighDetailLOD: boolean
  disableLabels: boolean
  disableNodeGlow: boolean
  showCrossSection: boolean
  crossSectionData: CrossSectionData | null
  plannedPath: PlannedPath | null
  showPathPlanning: boolean
}

interface PipelineActions {
  fetchPipes: () => Promise<void>
  fetchNodes: () => Promise<void>
  selectPipe: (id: string | null) => void
  fetchAlarms: (acknowledged?: boolean) => Promise<void>
  fetchAnnotations: (pipeId: string) => Promise<void>
  fetchInspectionPaths: () => Promise<void>
  addAnnotation: (annotation: Annotation) => void
  acknowledgeAlarm: (id: string, userId: string) => void
  setRealtimeData: (data: RealtimeData | RealtimeData[]) => void
  addAlarm: (alarm: AlarmRecord) => void
  setOnlineUsers: (users: CollaborationUser[]) => void
  setCurrentUser: (user: CollaborationUser) => void
  updateOnlineUser: (user: CollaborationUser) => void
  updateOnlineUserWithPartial: (userId: string, updates: Partial<CollaborationUser>) => void
  removeOnlineUser: (userId: string) => void
  mergeRealtimeDelta: (deltas: (Partial<RealtimeData> & { pipeId: string; timestamp: number })[]) => void
  setPerformanceMode: (enabled: boolean) => void
  setDisableHighDetailLOD: (disabled: boolean) => void
  setDisableLabels: (disabled: boolean) => void
  setDisableNodeGlow: (disabled: boolean) => void
  toggleCrossSection: () => void
  setShowCrossSection: (show: boolean) => void
  setCrossSectionData: (data: CrossSectionData | null) => void
  setPlannedPath: (path: PlannedPath | null) => void
  setShowPathPlanning: (show: boolean) => void
  togglePathPlanning: () => void
}

let currentUserInitialized = false

export const usePipelineStore = create<PipelineState & PipelineActions>()(
  (set) => ({
    pipes: [],
    nodes: [],
    selectedPipeId: null,
    realtimeData: new Map(),
    alarms: [],
    annotations: [],
    inspectionPaths: [],
    onlineUsers: [],
    currentUser: currentUserInitialized ? null : (() => {
      currentUserInitialized = true
      return generateCurrentUser()
    })(),
    isLoading: false,
    performanceMode: false,
    disableHighDetailLOD: false,
    disableLabels: false,
    disableNodeGlow: false,
    showCrossSection: false,
    crossSectionData: null,
    plannedPath: null,
    showPathPlanning: false,

    fetchPipes: async () => {
      set({ isLoading: true })
      try {
        const res = await fetch('/api/pipes')
        const json = await res.json()
        const pipes: PipeSegment[] = json.data ?? json
        set({ pipes })
      } finally {
        set({ isLoading: false })
      }
    },

    fetchNodes: async () => {
      set({ isLoading: true })
      try {
        const res = await fetch('/api/nodes')
        const json = await res.json()
        const nodes: PipeNode[] = json.data ?? json
        set({ nodes })
      } finally {
        set({ isLoading: false })
      }
    },

    selectPipe: (id) => set({ selectedPipeId: id }),

    fetchAlarms: async (acknowledged?: boolean) => {
      set({ isLoading: true })
      try {
        const params = acknowledged !== undefined ? `?acknowledged=${acknowledged}` : ''
        const res = await fetch(`/api/alarms${params}`)
        const json = await res.json()
        const alarms: AlarmRecord[] = json.data ?? json
        set({ alarms })
      } finally {
        set({ isLoading: false })
      }
    },

    fetchAnnotations: async (pipeId: string) => {
      set({ isLoading: true })
      try {
        const res = await fetch(`/api/annotations?pipeId=${pipeId}`)
        const json = await res.json()
        const annotations: Annotation[] = json.data ?? json
        set({ annotations })
      } finally {
        set({ isLoading: false })
      }
    },

    fetchInspectionPaths: async () => {
      set({ isLoading: true })
      try {
        const res = await fetch('/api/inspections')
        const json = await res.json()
        const inspectionPaths: InspectionPath[] = json.data ?? json
        set({ inspectionPaths })
      } finally {
        set({ isLoading: false })
      }
    },

    addAnnotation: (annotation) =>
      set((state) => ({ annotations: [...state.annotations, annotation] })),

    acknowledgeAlarm: (id, userId) =>
      set((state) => ({
        alarms: state.alarms.map((a) =>
          a.id === id ? { ...a, acknowledged: true, acknowledgedBy: userId } : a
        ),
      })),

    setRealtimeData: (data) =>
      set((state) => {
        const next = new Map(state.realtimeData)
        if (Array.isArray(data)) {
          for (const d of data) {
            next.set(d.pipeId, d)
          }
        } else {
          next.set(data.pipeId, data)
        }
        return { realtimeData: next }
      }),

    addAlarm: (alarm) =>
      set((state) => ({ alarms: [alarm, ...state.alarms] })),

    setOnlineUsers: (users) => set({ onlineUsers: users }),

    setCurrentUser: (user) => set({ currentUser: user }),

    updateOnlineUser: (user) =>
      set((state) => ({
        onlineUsers: state.onlineUsers.map((u) => (u.id === user.id ? user : u)),
      })),

    updateOnlineUserWithPartial: (userId, updates) =>
      set((state) => ({
        onlineUsers: state.onlineUsers.map((u) =>
          u.id === userId ? { ...u, ...updates } : u
        ),
      })),

    removeOnlineUser: (userId) =>
      set((state) => ({
        onlineUsers: state.onlineUsers.filter((u) => u.id !== userId),
      })),

    mergeRealtimeDelta: (deltas) =>
      set((state) => {
        const next = new Map(state.realtimeData)
        for (const delta of deltas) {
          const existing = next.get(delta.pipeId)
          if (existing) {
            next.set(delta.pipeId, { ...existing, ...delta })
          }
        }
        return { realtimeData: next }
      }),

    toggleCrossSection: () =>
      set((state) => ({ showCrossSection: !state.showCrossSection })),

    setShowCrossSection: (show) => set({ showCrossSection: show }),

    setCrossSectionData: (data) => set({ crossSectionData: data }),

    setPlannedPath: (path) => set({ plannedPath: path }),

    setShowPathPlanning: (show) => set({ showPathPlanning: show }),

    togglePathPlanning: () =>
      set((state) => ({ showPathPlanning: !state.showPathPlanning })),

    setPerformanceMode: (enabled) => set({ performanceMode: enabled }),
    setDisableHighDetailLOD: (disabled) => set({ disableHighDetailLOD: disabled }),
    setDisableLabels: (disabled) => set({ disableLabels: disabled }),
    setDisableNodeGlow: (disabled) => set({ disableNodeGlow: disabled }),
  })
)
