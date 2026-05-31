import { create } from "zustand"
import type { InspectionResult, DefectRecord, DefectType, SummaryData, DistributionData, TrendData } from "@/types"

interface AppState {
  inspections: InspectionResult[]
  inspectionsTotal: number
  currentInspection: InspectionResult | null
  defects: DefectRecord[]
  defectsTotal: number
  currentDefect: DefectRecord | null
  defectTypes: DefectType[]
  searchResults: DefectRecord[]
  summary: SummaryData | null
  distribution: DistributionData | null
  trend: TrendData | null
  loading: boolean
  uploadingFiles: File[]
  uploadProgress: Record<string, number>

  setInspections: (items: InspectionResult[], total: number) => void
  setCurrentInspection: (inspection: InspectionResult | null) => void
  setDefects: (items: DefectRecord[], total: number) => void
  setCurrentDefect: (defect: DefectRecord | null) => void
  setDefectTypes: (types: DefectType[]) => void
  setSearchResults: (results: DefectRecord[]) => void
  setSummary: (data: SummaryData) => void
  setDistribution: (data: DistributionData) => void
  setTrend: (data: TrendData) => void
  setLoading: (loading: boolean) => void
  setUploadingFiles: (files: File[]) => void
  setUploadProgress: (filename: string, progress: number) => void
  updateDefectInList: (defect: DefectRecord) => void
}

export const useStore = create<AppState>((set) => ({
  inspections: [],
  inspectionsTotal: 0,
  currentInspection: null,
  defects: [],
  defectsTotal: 0,
  currentDefect: null,
  defectTypes: [],
  searchResults: [],
  summary: null,
  distribution: null,
  trend: null,
  loading: false,
  uploadingFiles: [],
  uploadProgress: {},

  setInspections: (items, total) => set({ inspections: items, inspectionsTotal: total }),
  setCurrentInspection: (inspection) => set({ currentInspection: inspection }),
  setDefects: (items, total) => set({ defects: items, defectsTotal: total }),
  setCurrentDefect: (defect) => set({ currentDefect: defect }),
  setDefectTypes: (types) => set({ defectTypes: types }),
  setSearchResults: (results) => set({ searchResults: results }),
  setSummary: (data) => set({ summary: data }),
  setDistribution: (data) => set({ distribution: data }),
  setTrend: (data) => set({ trend: data }),
  setLoading: (loading) => set({ loading }),
  setUploadingFiles: (files) => set({ uploadingFiles: files }),
  setUploadProgress: (filename, progress) =>
    set((state) => ({ uploadProgress: { ...state.uploadProgress, [filename]: progress } })),
  updateDefectInList: (defect) =>
    set((state) => ({
      defects: state.defects.map((d) => (d.id === defect.id ? defect : d)),
    })),
}))
