import { create } from 'zustand';
import {
  Project,
  ProjectFile,
  ValidationResult,
  SyncStatus,
  CloudProject,
  VersionInfo,
  AppConfig,
  ExportOptions,
  ExportProgress,
} from '../../shared/types';
import { generateId, createProjectFile as createFile } from '../../shared/utils';

interface AppState {
  projects: Project[];
  currentProject: Project | null;
  openFiles: ProjectFile[];
  activeFileId: string | null;
  validationResults: ValidationResult[];
  cloudProjects: CloudProject[];
  versions: VersionInfo[];
  syncStatus: Map<string, SyncStatus>;
  config: AppConfig | null;
  isLoading: boolean;
  error: string | null;
  activePanel: 'files' | 'cloud' | 'versions' | 'validation';
  expandedFolders: Set<string>;

  loadProjects: () => Promise<void>;
  createProject: (name: string, description?: string) => Promise<Project | null>;
  openProject: (projectId: string) => Promise<void>;
  saveProject: () => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  closeProject: () => void;

  openFile: (file: ProjectFile) => void;
  closeFile: (fileId: string) => void;
  setActiveFile: (fileId: string) => void;
  updateFileContent: (fileId: string, content: string) => void;
  createNewFile: (name: string, path: string, content?: string) => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
  renameFile: (fileId: string, newName: string, newPath: string) => Promise<void>;

  validateFile: (file: ProjectFile) => Promise<void>;
  validateProject: () => Promise<void>;
  clearValidation: () => void;

  syncProject: () => Promise<void>;
  pushToCloud: () => Promise<void>;
  pullFromCloud: (cloudId: string) => Promise<void>;
  loadCloudProjects: () => Promise<void>;
  getSyncStatus: (projectId: string) => Promise<SyncStatus>;

  loadVersions: (projectId: string, cloudId?: string) => Promise<void>;
  createVersion: (description: string, author: string, cloudId?: string) => Promise<void>;
  rollbackToVersion: (version: string, cloudId?: string) => Promise<void>;

  loadConfig: () => Promise<void>;
  updateConfig: (config: Partial<AppConfig>) => Promise<void>;

  encryptProject: (password: string) => Promise<boolean>;
  decryptProject: (password: string) => Promise<boolean>;

  exportProject: (outputPath: string, options: ExportOptions) => Promise<boolean>;
  batchExport: (projectIds: string[], outputDir: string, options: ExportOptions) => Promise<string[] | null>;
  importProject: (filePath: string, password?: string) => Promise<Project | null>;

  exportProgress: ExportProgress;
  setExportProgress: (progress: ExportProgress) => void;

  toggleFolder: (path: string) => void;
  setActivePanel: (panel: 'files' | 'cloud' | 'versions' | 'validation') => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  currentProject: null,
  openFiles: [],
  activeFileId: null,
  validationResults: [],
  cloudProjects: [],
  versions: [],
  syncStatus: new Map(),
  config: null,
  isLoading: false,
  error: null,
  activePanel: 'files',
  expandedFolders: new Set(),
  exportProgress: {
    status: 'idle',
    progress: 0,
    totalFiles: 0,
    processedFiles: 0,
    message: '',
  },

  loadProjects: async () => {
    set({ isLoading: true });
    try {
      const response = await window.electronAPI.project.list();
      if (response.success && response.data) {
        set({ projects: response.data });
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  createProject: async (name: string, description?: string) => {
    set({ isLoading: true });
    try {
      const response = await window.electronAPI.project.new(name, description);
      if (response.success && response.data) {
        set((state) => ({
          projects: [response.data!, ...state.projects],
          currentProject: response.data,
        }));
        return response.data;
      }
      return null;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  openProject: async (projectId: string) => {
    set({ isLoading: true });
    try {
      const response = await window.electronAPI.project.open(projectId);
      if (response.success && response.data) {
        set({
          currentProject: response.data,
          openFiles: [],
          activeFileId: null,
          validationResults: [],
          activePanel: 'files',
        });
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  saveProject: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.project.save(currentProject);
      if (response.success) {
        set((state) => ({
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                files: state.currentProject.files.map((f) => ({ ...f, isDirty: false })),
                isSynced: false,
              }
            : null,
          openFiles: state.openFiles.map((f) => ({ ...f, isDirty: false })),
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  deleteProject: async (projectId: string) => {
    set({ isLoading: true });
    try {
      const response = await window.electronAPI.project.delete(projectId);
      if (response.success) {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== projectId),
          currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  closeProject: () => {
    set({
      currentProject: null,
      openFiles: [],
      activeFileId: null,
      validationResults: [],
      versions: [],
    });
  },

  openFile: (file: ProjectFile) => {
    set((state) => {
      const isOpen = state.openFiles.some((f) => f.id === file.id);
      return {
        openFiles: isOpen ? state.openFiles : [...state.openFiles, file],
        activeFileId: file.id,
      };
    });
  },

  closeFile: (fileId: string) => {
    set((state) => {
      const newOpenFiles = state.openFiles.filter((f) => f.id !== fileId);
      const newActiveId =
        state.activeFileId === fileId
          ? newOpenFiles.length > 0
            ? newOpenFiles[newOpenFiles.length - 1].id
            : null
          : state.activeFileId;
      return {
        openFiles: newOpenFiles,
        activeFileId: newActiveId,
      };
    });
  },

  setActiveFile: (fileId: string) => {
    set({ activeFileId: fileId });
  },

  updateFileContent: (fileId: string, content: string) => {
    const contentSize = new TextEncoder().encode(content).length;
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.id === fileId
          ? {
              ...f,
              content,
              size: contentSize,
              lastModified: Date.now(),
              isDirty: true,
            }
          : f
      ),
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            files: state.currentProject.files.map((f) =>
              f.id === fileId
                ? {
                    ...f,
                    content,
                    size: contentSize,
                    lastModified: Date.now(),
                    isDirty: true,
                  }
                : f
            ),
            updatedAt: Date.now(),
            isSynced: false,
          }
        : null,
    }));
  },

  createNewFile: async (name: string, filePath: string, content: string = '') => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.file.write(
        currentProject.id,
        name,
        filePath,
        content
      );
      if (response.success && response.data) {
        const newFile = response.data;
        set((state) => ({
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                files: [...state.currentProject.files, newFile],
                updatedAt: Date.now(),
                isSynced: false,
              }
            : null,
          openFiles: [...state.openFiles, newFile],
          activeFileId: newFile.id,
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  deleteFile: async (fileId: string) => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.file.delete(currentProject.id, fileId);
      if (response.success) {
        set((state) => ({
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                files: state.currentProject.files.filter((f) => f.id !== fileId),
                updatedAt: Date.now(),
                isSynced: false,
              }
            : null,
          openFiles: state.openFiles.filter((f) => f.id !== fileId),
          activeFileId: state.activeFileId === fileId ? null : state.activeFileId,
          validationResults: state.validationResults.filter((r) => r.fileId !== fileId),
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  renameFile: async (fileId: string, newName: string, newPath: string) => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.file.rename(
        currentProject.id,
        fileId,
        newName,
        newPath
      );
      if (response.success) {
        const updatedFile = currentProject.files.find((f) => f.id === fileId);
        if (updatedFile) {
          const newFileData = {
            ...updatedFile,
            name: newName,
            path: newPath,
            lastModified: Date.now(),
            isDirty: true,
          };
          set((state) => ({
            currentProject: state.currentProject
              ? {
                  ...state.currentProject,
                  files: state.currentProject.files.map((f) =>
                    f.id === fileId ? newFileData : f
                  ),
                  updatedAt: Date.now(),
                  isSynced: false,
                }
              : null,
            openFiles: state.openFiles.map((f) => (f.id === fileId ? newFileData : f)),
          }));
        }
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  validateFile: async (file: ProjectFile) => {
    try {
      const response = await window.electronAPI.validate.file(file);
      if (response.success && response.data) {
        set((state) => ({
          validationResults: [
            ...state.validationResults.filter((r) => r.fileId !== file.id),
            response.data!,
          ],
          activePanel: 'validation',
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  validateProject: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.validate.project(currentProject.files);
      if (response.success && response.data) {
        set({
          validationResults: response.data,
          activePanel: 'validation',
        });
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  clearValidation: () => {
    set({ validationResults: [] });
  },

  syncProject: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.sync.start(currentProject.id);
      if (response.success) {
        await get().loadProjects();
        await get().openProject(currentProject.id);
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  pushToCloud: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.sync.push(currentProject.id);
      if (response.success) {
        await get().loadProjects();
        await get().loadCloudProjects();
        await get().openProject(currentProject.id);
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  pullFromCloud: async (cloudId: string) => {
    set({ isLoading: true });
    try {
      const response = await window.electronAPI.sync.pull(cloudId);
      if (response.success && response.data) {
        const newProject = response.data;
        set((state) => ({
          projects: [newProject, ...state.projects],
          currentProject: newProject,
          openFiles: [],
          activeFileId: null,
        }));
        await get().loadCloudProjects();
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  loadCloudProjects: async () => {
    set({ isLoading: true });
    try {
      const response = await window.electronAPI.cloud.list();
      if (response.success && response.data) {
        set({ cloudProjects: response.data });
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  getSyncStatus: async (projectId: string) => {
    try {
      const response = await window.electronAPI.sync.status(projectId);
      if (response.success && response.data) {
        set((state) => {
          const newSyncStatus = new Map(state.syncStatus);
          newSyncStatus.set(projectId, response.data!);
          return { syncStatus: newSyncStatus };
        });
        return response.data;
      }
      return { status: 'idle' as const, progress: 0 };
    } catch (error) {
      set({ error: (error as Error).message });
      return { status: 'error' as const, progress: 0, message: (error as Error).message };
    }
  },

  loadVersions: async (projectId: string, cloudId?: string) => {
    set({ isLoading: true });
    try {
      const response = await window.electronAPI.version.list(projectId, cloudId);
      if (response.success && response.data) {
        set({ versions: response.data });
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  createVersion: async (description: string, author: string, cloudId?: string) => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.version.create(
        currentProject.id,
        description,
        author,
        cloudId
      );
      if (response.success && response.data) {
        set((state) => ({
          versions: [response.data!, ...state.versions],
          currentProject: state.currentProject
            ? { ...state.currentProject, version: response.data!.version }
            : null,
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  rollbackToVersion: async (version: string, cloudId?: string) => {
    const { currentProject } = get();
    if (!currentProject) return;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.version.rollback(
        currentProject.id,
        version,
        cloudId
      );
      if (response.success && response.data) {
        set((state) => ({
          currentProject: state.currentProject
            ? {
                ...state.currentProject,
                files: response.data!,
                version,
                updatedAt: Date.now(),
                isSynced: false,
              }
            : null,
          openFiles: [],
          activeFileId: null,
          validationResults: [],
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  loadConfig: async () => {
    try {
      const response = await window.electronAPI.config.get();
      if (response.success && response.data) {
        set({ config: response.data });
      }
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  updateConfig: async (config: Partial<AppConfig>) => {
    try {
      const response = await window.electronAPI.config.set(config);
      if (response.success) {
        await get().loadConfig();
      }
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  toggleFolder: (path: string) => {
    set((state) => {
      const newExpanded = new Set(state.expandedFolders);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return { expandedFolders: newExpanded };
    });
  },

  setActivePanel: (panel: 'files' | 'cloud' | 'versions' | 'validation') => {
    set({ activePanel: panel });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  encryptProject: async (password: string) => {
    const { currentProject } = get();
    if (!currentProject) return false;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.encryption.encrypt(currentProject.id, password);
      if (response.success && response.data) {
        set({ currentProject: response.data });
        return true;
      }
      return false;
    } catch (error) {
      set({ error: (error as Error).message });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  decryptProject: async (password: string) => {
    const { currentProject } = get();
    if (!currentProject) return false;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.encryption.decrypt(currentProject.id, password);
      if (response.success && response.data) {
        set({ currentProject: response.data });
        return true;
      }
      return false;
    } catch (error) {
      set({ error: (error as Error).message });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  exportProject: async (outputPath: string, options: ExportOptions) => {
    const { currentProject } = get();
    if (!currentProject) return false;

    set({ isLoading: true });
    try {
      const response = await window.electronAPI.export.export(currentProject.id, outputPath, options);
      if (response.success) {
        return true;
      }
      return false;
    } catch (error) {
      set({ error: (error as Error).message });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  batchExport: async (projectIds: string[], outputDir: string, options: ExportOptions) => {
    set({ isLoading: true });
    try {
      const response = await window.electronAPI.export.batchExport(projectIds, outputDir, options);
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  importProject: async (filePath: string, password?: string) => {
    set({ isLoading: true });
    try {
      const response = await window.electronAPI.export.import(filePath, password);
      if (response.success && response.data) {
        const newProject = response.data;
        set((state) => ({
          projects: [newProject, ...state.projects],
          currentProject: newProject,
          openFiles: [],
          activeFileId: null,
        }));
        return newProject;
      }
      return null;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  setExportProgress: (progress: ExportProgress) => {
    set({ exportProgress: progress });
  },
}));
