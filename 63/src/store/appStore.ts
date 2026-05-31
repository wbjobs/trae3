import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { ArchiveMetadata, QualityRecord, UploadTask, User } from '../../shared/types';
import { mockArchives, mockQualityRecords, mockUploadTasks, mockUser } from '../data/mockData';

interface AppState {
  user: User | null;
  archives: ArchiveMetadata[];
  qualityRecords: QualityRecord[];
  uploadTasks: UploadTask[];
  selectedArchive: ArchiveMetadata | null;
  isLoading: boolean;
  
  setUser: (user: User | null) => void;
  setArchives: (archives: ArchiveMetadata[]) => void;
  addArchive: (archive: ArchiveMetadata) => void;
  updateArchiveStatus: (id: string, status: ArchiveMetadata['status'], qualityScore?: number) => void;
  setQualityRecords: (records: QualityRecord[]) => void;
  addQualityRecord: (record: QualityRecord) => void;
  completeQualityCheck: (archiveId: string, record: QualityRecord) => void;
  batchQualityCheck: (archiveIds: string[], result: 'PASS' | 'FAIL', inspector: string, comments?: string) => {
    success: string[];
    failed: string[];
  };
  setUploadTasks: (tasks: UploadTask[]) => void;
  addUploadTask: (task: UploadTask) => void;
  updateUploadTask: (id: string, updates: Partial<UploadTask>) => void;
  setSelectedArchive: (archive: ArchiveMetadata | null) => void;
  setIsLoading: (loading: boolean) => void;
  loadMockData: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  archives: [],
  qualityRecords: [],
  uploadTasks: [],
  selectedArchive: null,
  isLoading: false,

  setUser: (user) => set({ user }),
  setArchives: (archives) => set({ archives }),
  addArchive: (archive) => set((state) => ({ archives: [archive, ...state.archives] })),
  updateArchiveStatus: (id, status, qualityScore) => set((state) => ({
    archives: state.archives.map(a => 
      a.id === id ? { ...a, status, qualityScore: qualityScore !== undefined ? qualityScore : a.qualityScore } : a
    )
  })),
  setQualityRecords: (records) => set({ qualityRecords: records }),
  addQualityRecord: (record) => set((state) => ({
    qualityRecords: [record, ...state.qualityRecords]
  })),
  completeQualityCheck: (archiveId, record) => set((state) => {
    const newStatus: ArchiveMetadata['status'] = record.result === 'PASS' ? 'APPROVED' : 'REJECTED';
    let qualityScore = record.result === 'PASS' ? 90 : 60;
    if (record.issues.length > 0) {
      const criticalCount = record.issues.filter(i => i.severity === 'CRITICAL').length;
      const majorCount = record.issues.filter(i => i.severity === 'MAJOR').length;
      const minorCount = record.issues.filter(i => i.severity === 'MINOR').length;
      qualityScore = Math.max(0, 100 - criticalCount * 30 - majorCount * 15 - minorCount * 5);
    }
    return {
      archives: state.archives.map(a =>
        a.id === archiveId ? { ...a, status: newStatus, qualityScore } : a
      ),
      qualityRecords: [record, ...state.qualityRecords]
    };
  }),
  batchQualityCheck: (archiveIds, result, inspector, comments = '') => {
    const success: string[] = [];
    const failed: string[] = [];
    
    useAppStore.setState((state) => {
      const newStatus: ArchiveMetadata['status'] = result === 'PASS' ? 'APPROVED' : 'REJECTED';
      const qualityScore = result === 'PASS' ? 90 : 60;
      const now = new Date().toLocaleString();
      
      const newRecords: QualityRecord[] = [];
      const updatedArchives = state.archives.map(a => {
        if (archiveIds.includes(a.id) && (a.status === 'PENDING' || a.status === 'QUALITY_CHECKING')) {
          newRecords.push({
            id: uuidv4(),
            archiveId: a.id,
            inspector,
            checkTime: now,
            result,
            comments,
            issues: []
          });
          success.push(a.id);
          return { ...a, status: newStatus, qualityScore };
        }
        if (archiveIds.includes(a.id)) {
          failed.push(a.id);
        }
        return a;
      });

      return {
        archives: updatedArchives,
        qualityRecords: [...newRecords, ...state.qualityRecords]
      };
    });

    return { success, failed };
  },
  setUploadTasks: (tasks) => set({ uploadTasks: tasks }),
  addUploadTask: (task) => set((state) => ({ uploadTasks: [task, ...state.uploadTasks] })),
  updateUploadTask: (id, updates) => set((state) => ({
    uploadTasks: state.uploadTasks.map(t => 
      t.id === id ? { ...t, ...updates } : t
    )
  })),
  setSelectedArchive: (archive) => set({ selectedArchive: archive }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  
  loadMockData: () => set({
    user: mockUser,
    archives: mockArchives,
    qualityRecords: mockQualityRecords,
    uploadTasks: mockUploadTasks
  })
}));
