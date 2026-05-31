export interface ElectronAPI {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<IPCResponse<T>>;
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;

  project: {
    new: (name: string, description?: string) => Promise<IPCResponse<Project>>;
    open: (projectId: string) => Promise<IPCResponse<Project | null>>;
    save: (project: Project) => Promise<IPCResponse<void>>;
    delete: (projectId: string) => Promise<IPCResponse<void>>;
    list: () => Promise<IPCResponse<Project[]>>;
  };

  file: {
    read: (projectId: string, filePath: string) => Promise<IPCResponse<ProjectFile | null>>;
    write: (projectId: string, name: string, filePath: string, content: string) => Promise<IPCResponse<ProjectFile>>;
    delete: (projectId: string, fileId: string) => Promise<IPCResponse<void>>;
    rename: (projectId: string, fileId: string, newName: string, newPath: string) => Promise<IPCResponse<void>>;
  };

  validate: {
    file: (file: ProjectFile) => Promise<IPCResponse<ValidationResult>>;
    project: (files: ProjectFile[]) => Promise<IPCResponse<ValidationResult[]>>;
  };

  sync: {
    start: (projectId: string) => Promise<IPCResponse<void>>;
    status: (projectId: string) => Promise<IPCResponse<SyncStatus>>;
    push: (projectId: string) => Promise<IPCResponse<void>>;
    pull: (cloudId: string) => Promise<IPCResponse<Project>>;
  };

  cloud: {
    list: () => Promise<IPCResponse<CloudProject[]>>;
    get: (cloudId: string) => Promise<IPCResponse<CloudProject>>;
    create: (project: Project) => Promise<IPCResponse<CloudProject>>;
    delete: (cloudId: string) => Promise<IPCResponse<void>>;
  };

  cache: {
    get: (key: string) => Promise<IPCResponse<CacheEntry<unknown> | null>>;
    set: (key: string, data: unknown, ttl?: number) => Promise<IPCResponse<void>>;
    clear: (key?: string) => Promise<IPCResponse<void>>;
  };

  version: {
    list: (projectId: string, cloudId?: string) => Promise<IPCResponse<VersionInfo[]>>;
    create: (projectId: string, description: string, author: string, cloudId?: string) => Promise<IPCResponse<VersionInfo>>;
    rollback: (projectId: string, version: string, cloudId?: string) => Promise<IPCResponse<ProjectFile[]>>;
  };

  config: {
    get: () => Promise<IPCResponse<AppConfig>>;
    set: (config: Partial<AppConfig>) => Promise<IPCResponse<void>>;
  };

  dialog: {
    showMessageBox: (options: MessageBoxOptions) => Promise<MessageBoxReturnValue>;
    showOpenDialog: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>;
    showSaveDialog: (options: SaveDialogOptions) => Promise<SaveDialogReturnValue>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
