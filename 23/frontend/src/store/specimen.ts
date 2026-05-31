import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { Specimen, Annotation } from '@/types'

interface SpecimenImage {
  id: number
  specimenId: number
  fileId: number
  imageUrl: string
  fileUrl: string
  imageType: number
  sort: number
  description: string
  previewUrl: string
  objectName?: string
  createTime: string
}

interface SpecimenState {
  currentSpecimen: Specimen | null
  currentImage: SpecimenImage | null
  annotations: Annotation[]
  selectedAnnotation: Annotation | null
  annotationHistory: Annotation[][]
  historyIndex: number
}

const initialState: SpecimenState = {
  currentSpecimen: null,
  currentImage: null,
  annotations: [],
  selectedAnnotation: null,
  annotationHistory: [],
  historyIndex: -1
}

const specimenSlice = createSlice({
  name: 'specimen',
  initialState,
  reducers: {
    setCurrentSpecimen: (state, action: PayloadAction<Specimen | null>) => {
      state.currentSpecimen = action.payload
    },
    setCurrentImage: (state, action: PayloadAction<SpecimenImage | null>) => {
      state.currentImage = action.payload
    },
    setAnnotations: (state, action: PayloadAction<Annotation[]>) => {
      state.annotations = action.payload
    },
    addAnnotation: (state, action: PayloadAction<Annotation>) => {
      state.annotations.push(action.payload)
      state.annotationHistory = [...state.annotationHistory.slice(0, state.historyIndex + 1), [...state.annotations]]
      state.historyIndex++
    },
    updateAnnotation: (state, action: PayloadAction<Annotation>) => {
      const index = state.annotations.findIndex(a => a.id === action.payload.id)
      if (index !== -1) {
        state.annotations[index] = action.payload
        state.annotationHistory = [...state.annotationHistory.slice(0, state.historyIndex + 1), [...state.annotations]]
        state.historyIndex++
      }
    },
    deleteAnnotation: (state, action: PayloadAction<number>) => {
      state.annotations = state.annotations.filter(a => a.id !== action.payload)
      state.annotationHistory = [...state.annotationHistory.slice(0, state.historyIndex + 1), [...state.annotations]]
      state.historyIndex++
    },
    setSelectedAnnotation: (state, action: PayloadAction<Annotation | null>) => {
      state.selectedAnnotation = action.payload
    },
    undoAnnotation: (state) => {
      if (state.historyIndex > 0) {
        state.historyIndex--
        state.annotations = [...state.annotationHistory[state.historyIndex]]
      }
    },
    redoAnnotation: (state) => {
      if (state.historyIndex < state.annotationHistory.length - 1) {
        state.historyIndex++
        state.annotations = [...state.annotationHistory[state.historyIndex]]
      }
    },
    clearAnnotationState: (state) => {
      state.currentSpecimen = null
      state.currentImage = null
      state.annotations = []
      state.selectedAnnotation = null
      state.annotationHistory = []
      state.historyIndex = -1
    }
  }
})

export const {
  setCurrentSpecimen,
  setCurrentImage,
  setAnnotations,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  setSelectedAnnotation,
  undoAnnotation,
  redoAnnotation,
  clearAnnotationState
} = specimenSlice.actions
export default specimenSlice.reducer
