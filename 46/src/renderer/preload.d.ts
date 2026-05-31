interface ElectronAPI {
  parser: {
    parse: (content: string, format: string) => Promise<any>;
    validate: (content: string, format: string) => Promise<any[]>;
  };
  converter: {
    convert: (content: string, sourceFormat: string, targetFormat: string) => Promise<any>;
  };
  files: {
    import: (name: string, content: string, format: string) => Promise<any>;
    list: () => Promise<any[]>;
    get: (id: string) => Promise<any>;
    read: (id: string) => Promise<string>;
    readVersion: (id: string, version: number) => Promise<string>;
    update: (id: string, content: string, description: string) => Promise<any>;
    delete: (id: string) => Promise<void>;
    versions: (id: string) => Promise<any[]>;
    search: (query: string, format?: string) => Promise<any[]>;
    openDialog: () => Promise<any>;
    saveDialog: () => Promise<any>;
  };
  sync: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    status: () => Promise<any>;
    resolveConflict: (conflictId: string, resolution: string) => Promise<void>;
  };
  config: {
    get: () => Promise<any>;
    update: (updates: any) => Promise<any>;
    reset: () => Promise<any>;
  };
  stats: {
    get: () => Promise<any>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
