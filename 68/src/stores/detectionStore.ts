import { create } from 'zustand';
import type { Detection, DetectionListItem, FaultRegion, FaultClassification } from '../../shared/types';
import * as api from '@/utils/api';

interface DetectionState {
  currentDetection: Detection | null;
  detectionList: DetectionListItem[];
  totalDetections: number;
  currentPage: number;
  uploadProgress: number;
  isUploading: boolean;
  isDetecting: boolean;
  detectionStage: 'idle' | 'preprocessing' | 'inference' | 'classification' | 'completed';
  selectedIds: string[];
  annotationMode: boolean;
  uploadImages: (files: File[]) => Promise<void>;
  fetchDetection: (id: string) => Promise<void>;
  fetchDetectionList: (params?: Record<string, string | number>) => Promise<void>;
  resetDetection: () => void;
  toggleSelectId: (id: string) => void;
  clearSelection: () => void;
  setAnnotationMode: (mode: boolean) => void;
  saveAnnotation: (regions: FaultRegion[], classifications: FaultClassification[]) => Promise<void>;
  exportSelected: (format: 'json' | 'pdf' | 'excel') => Promise<void>;
}

export const useDetectionStore = create<DetectionState>((set, get) => ({
  currentDetection: null,
  detectionList: [],
  totalDetections: 0,
  currentPage: 1,
  uploadProgress: 0,
  isUploading: false,
  isDetecting: false,
  detectionStage: 'idle',
  selectedIds: [],
  annotationMode: false,

  uploadImages: async (files: File[]) => {
    set({ isUploading: true, uploadProgress: 0, detectionStage: 'idle', annotationMode: false });
    try {
      const progressInterval = setInterval(() => {
        set((state) => ({
          uploadProgress: Math.min(state.uploadProgress + 15, 85),
        }));
      }, 150);

      set({ detectionStage: 'preprocessing' });

      const detection = await api.uploadImages(files);
      clearInterval(progressInterval);

      set({
        uploadProgress: 100,
        isUploading: false,
        isDetecting: true,
        detectionStage: 'inference',
        currentDetection: detection,
      });

      setTimeout(() => {
        if (get().currentDetection?.id === detection.id) {
          set({ detectionStage: 'classification' });
          setTimeout(() => {
            if (get().currentDetection?.id === detection.id) {
              set({ detectionStage: 'completed', isDetecting: false });
            }
          }, 400);
        }
      }, 300);
    } catch {
      set({ isUploading: false, uploadProgress: 0, detectionStage: 'idle' });
    }
  },

  fetchDetection: async (id: string) => {
    try {
      const detection = await api.getDetection(id);
      set({ currentDetection: detection, annotationMode: false });
    } catch {
      // handle error
    }
  },

  fetchDetectionList: async (params?: Record<string, string | number>) => {
    try {
      const response = await api.getDetectionList(params);
      set({
        detectionList: response.items,
        totalDetections: response.total,
        currentPage: response.page,
      });
    } catch {
      // handle error
    }
  },

  resetDetection: () => {
    set({
      currentDetection: null,
      uploadProgress: 0,
      isUploading: false,
      isDetecting: false,
      detectionStage: 'idle',
      annotationMode: false,
    });
  },

  toggleSelectId: (id: string) => {
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((i) => i !== id)
        : [...state.selectedIds, id],
    }));
  },

  clearSelection: () => {
    set({ selectedIds: [] });
  },

  setAnnotationMode: (mode: boolean) => {
    set({ annotationMode: mode });
  },

  saveAnnotation: async (regions: FaultRegion[], classifications: FaultClassification[]) => {
    const detection = get().currentDetection;
    if (!detection) return;
    try {
      const updated = await api.updateAnnotation(detection.id, regions, classifications);
      set({ currentDetection: updated, annotationMode: false });
    } catch {
      // handle error
    }
  },

  exportSelected: async (format: 'json' | 'pdf' | 'excel') => {
    const ids = get().selectedIds;
    if (ids.length === 0) return;
    try {
      const result = await api.batchExport(ids, format);
      let url: string;
      let filename: string;
      if (result.base64) {
        const byteChars = atob(result.base64);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          bytes[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/json' });
        url = URL.createObjectURL(blob);
        filename = result.filename;
      } else if (result.downloadUrl) {
        url = result.downloadUrl;
        filename = result.filename;
      } else {
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      if (result.base64) {
        URL.revokeObjectURL(url);
      }
    } catch {
      // handle error
    }
  },
}));
