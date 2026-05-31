interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface ElectronAPI {
  convert: {
    start: (sourceFile: any, targetFormat: string, outputDir: string, options?: any) => Promise<any>;
    cancel: (taskId: string) => Promise<any>;
    batch: (sourceFiles: any[], targetFormat: string, outputDir: string, options?: any) => Promise<any>;
    getCacheStats: () => Promise<any>;
    clearCache: () => Promise<any>;
    onProgress: (callback: (task: any) => void) => () => void;
  };
  compare: {
    start: (drawingId: string, versionA: number, versionB: number) => Promise<any>;
    highlight: (drawingId: string, versionA: number, versionB: number) => Promise<any>;
    onResult: (callback: (result: any) => void) => () => void;
  };
  sync: {
    getStatus: () => Promise<any>;
    upload: (drawing: any, localPath: string) => Promise<any>;
    download: (cloudDrawing: any, savePath: string) => Promise<any>;
    onProgress: (callback: (task: any) => void) => () => void;
  };
  cache: {
    getStats: () => Promise<any>;
    clear: () => Promise<any>;
    get: (key: string) => Promise<any>;
    set: (key: string, data: string, ttl?: number) => Promise<any>;
  };
  drawing: {
    list: () => Promise<any>;
    open: () => Promise<any>;
  };
  app: {
    getVersion: () => Promise<any>;
  };
  encrypt: {
    start: (sourcePath: string, outputPath?: string, keyId?: string) => Promise<any>;
    batch: (sourcePaths: string[], outputDir?: string, keyId?: string) => Promise<any>;
    decrypt: (sourcePath: string, outputPath?: string, keyId?: string) => Promise<any>;
    listKeys: () => Promise<any>;
    createKey: (name: string) => Promise<any>;
    deleteKey: (keyId: string) => Promise<any>;
    onProgress: (callback: (task: any) => void) => () => void;
  };
  platform: {
    getInfo: () => Promise<any>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
