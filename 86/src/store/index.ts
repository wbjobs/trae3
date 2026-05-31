import { create } from 'zustand';
import type {
  ScriptFile,
  LocalProject,
  SyncConfig,
  SyncStatus,
  ParseResult,
  SyntaxCheckResult,
  ScriptVersion,
  ScriptLanguage
} from '@/types';
import { invokeLoadSyncConfig, invokeListProjects, invokeGetSyncStatus } from '@/api/invoke';

interface AppStore {
  currentFile: ScriptFile | null;
  openFiles: ScriptFile[];
  projects: LocalProject[];
  currentProject: LocalProject | null;
  syncConfig: SyncConfig;
  syncStatus: SyncStatus;
  parseResult: ParseResult | null;
  syntaxResult: SyntaxCheckResult | null;
  versions: ScriptVersion[];
  isLoading: boolean;
  error: string | null;
  activeTab: string;
  init: () => Promise<void>;
  setCurrentFile: (file: ScriptFile | null) => void;
  openFile: (file: ScriptFile) => void;
  closeFile: (fileId: string) => void;
  updateFileContent: (fileId: string, content: string) => void;
  setProjects: (projects: LocalProject[]) => void;
  setCurrentProject: (project: LocalProject | null) => void;
  setSyncConfig: (config: SyncConfig) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setParseResult: (result: ParseResult | null) => void;
  setSyntaxResult: (result: SyntaxCheckResult | null) => void;
  setVersions: (versions: ScriptVersion[]) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setActiveTab: (tab: string) => void;
  updateFileLanguage: (fileId: string, language: ScriptLanguage) => void;
  clearParseResults: () => void;
}

const defaultSyncConfig: SyncConfig = {
  serverUrl: 'https://api.scriptworkstation.com',
  apiKey: '',
  username: '',
  autoSync: false,
  syncInterval: 300
};

const defaultSyncStatus: SyncStatus = {
  isSyncing: false,
  pendingFiles: 0,
  totalFiles: 0
};

export const useAppStore = create<AppStore>((set, get) => ({
  currentFile: null,
  openFiles: [],
  projects: [],
  currentProject: null,
  syncConfig: defaultSyncConfig,
  syncStatus: defaultSyncStatus,
  parseResult: null,
  syntaxResult: null,
  versions: [],
  isLoading: false,
  error: null,
  activeTab: 'editor',

  init: async () => {
    set({ isLoading: true });
    try {
      const [syncConfig, projects, syncStatus] = await Promise.all([
        invokeLoadSyncConfig(),
        invokeListProjects().catch(() => []),
        invokeGetSyncStatus().catch(() => defaultSyncStatus)
      ]);
      
      set({
        syncConfig: syncConfig || defaultSyncConfig,
        projects,
        syncStatus,
        isLoading: false
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize',
        isLoading: false
      });
    }
  },

  setCurrentFile: (file) => set({ currentFile: file }),

  openFile: (file) => {
    const { openFiles } = get();
    const exists = openFiles.find(f => f.id === file.id);
    if (!exists) {
      set({ openFiles: [...openFiles, file] });
    }
    set({ currentFile: file });
  },

  closeFile: (fileId) => {
    const { openFiles, currentFile } = get();
    const newOpenFiles = openFiles.filter(f => f.id !== fileId);
    
    let newCurrentFile = currentFile;
    if (currentFile?.id === fileId) {
      const index = openFiles.findIndex(f => f.id === fileId);
      newCurrentFile = newOpenFiles[Math.min(index, newOpenFiles.length - 1)] || null;
    }
    
    set({
      openFiles: newOpenFiles,
      currentFile: newCurrentFile
    });
  },

  updateFileContent: (fileId, content) => {
    const { openFiles, currentFile } = get();
    
    const updatedOpenFiles = openFiles.map(f => 
      f.id === fileId 
        ? { ...f, content, updatedAt: new Date().toISOString(), size: content.length }
        : f
    );
    
    const updatedCurrentFile = currentFile?.id === fileId
      ? { ...currentFile, content, updatedAt: new Date().toISOString(), size: content.length }
      : currentFile;
    
    set({
      openFiles: updatedOpenFiles,
      currentFile: updatedCurrentFile
    });
  },

  setProjects: (projects) => set({ projects }),

  setCurrentProject: (project) => set({ currentProject: project }),

  setSyncConfig: (config) => set({ syncConfig: config }),

  setSyncStatus: (status) => set({ syncStatus: status }),

  setParseResult: (result) => set({ parseResult: result }),

  setSyntaxResult: (result) => set({ syntaxResult: result }),

  setVersions: (versions) => set({ versions }),

  setIsLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  updateFileLanguage: (fileId, language) => {
    const { openFiles, currentFile } = get();
    
    const updatedOpenFiles = openFiles.map(f => 
      f.id === fileId ? { ...f, language } : f
    );
    
    const updatedCurrentFile = currentFile?.id === fileId
      ? { ...currentFile, language }
      : currentFile;
    
    set({
      openFiles: updatedOpenFiles,
      currentFile: updatedCurrentFile
    });
  },

  clearParseResults: () => set({ parseResult: null, syntaxResult: null })
}));
