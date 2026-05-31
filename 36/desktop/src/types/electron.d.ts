import type { RiskCheckResult } from '@shared/types';

export interface ElectronAPI {
  dialog: {
    openDirectory: () => Promise<string | undefined>;
    openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string[] | undefined>;
    saveFile: (defaultPath?: string) => Promise<string | undefined>;
  };

  fs: {
    readFile: (filePath: string, encoding?: BufferEncoding) => Promise<string | Buffer>;
    writeFile: (filePath: string, content: string | Buffer) => Promise<boolean>;
    exists: (filePath: string) => Promise<boolean>;
    stat: (filePath: string) => Promise<{
      size: number;
      mtime: number;
      isDirectory: boolean;
      isFile: boolean;
    }>;
    listDirectory: (dirPath: string) => Promise<Array<{
      name: string;
      path: string;
      isDirectory: boolean;
      size: number;
      mtime: number;
    }>>;
    findFiles: (dir: string, pattern: string) => Promise<string[]>;
    copyFile: (src: string, dest: string) => Promise<boolean>;
    deleteFile: (filePath: string) => Promise<boolean>;
  };

  crypto: {
    md5: (filePath: string) => Promise<string>;
    md5Sync: (data: string) => Promise<string>;
  };

  path: {
    join: (...paths: string[]) => Promise<string>;
    dirname: (filePath: string) => Promise<string>;
    basename: (filePath: string, ext?: string) => Promise<string>;
  };

  app: {
    getPath: (name: string) => Promise<string>;
    getVersion: () => Promise<string>;
    getName: () => Promise<string>;
  };

  process: {
    platform: () => Promise<NodeJS.Platform>;
    env: () => Promise<NodeJS.ProcessEnv>;
  };

  build: {
    start: (project: any, options: { cleanBuild: boolean; customEnv?: Record<string, string> }) => Promise<{ buildId: string; record: any }>;
    cancel: (buildId: string) => Promise<boolean>;
    onLog: (buildId: string, callback: (log: string) => void) => () => void;
    onComplete: (buildId: string, callback: (record: any) => void) => () => void;
  };

  compiler: {
    detect: () => Promise<any[]>;
    getVersion: (compilerPath: string, versionArg?: string) => Promise<string>;
  };

  shell: {
    openExternal: (url: string) => Promise<boolean>;
    openPath: (filePath: string) => Promise<string>;
  };

  snapshot: {
    create: (buildId: string, projectPath: string, includeContent?: boolean) => Promise<any | null>;
  };

  firmware: {
    analyzeSections: (firmwarePath: string) => Promise<{ text: number; data: number; bss: number } | null>;
  };

  files: {
    compareContents: (leftPath: string, rightPath: string) => Promise<{ left: string; right: string } | null>;
  };

  risk: {
    preCheck: (projects: any[]) => Promise<RiskCheckResult[]>;
  };

  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
