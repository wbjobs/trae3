import { contextBridge, ipcRenderer } from 'electron';
import type { FirmwareProject, BuildRecord, CompilerConfig, BuildSnapshot } from '@shared/types';

const electronAPI = {
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openFile: (filters?: { name: string; extensions: string[] }[]) =>
      ipcRenderer.invoke('dialog:openFile', filters),
    saveFile: (defaultPath?: string) =>
      ipcRenderer.invoke('dialog:saveFile', defaultPath)
  },

  fs: {
    readFile: (filePath: string, encoding?: BufferEncoding) =>
      ipcRenderer.invoke('fs:readFile', filePath, encoding),
    writeFile: (filePath: string, content: string | Buffer) =>
      ipcRenderer.invoke('fs:writeFile', filePath, content),
    exists: (filePath: string) =>
      ipcRenderer.invoke('fs:exists', filePath),
    stat: (filePath: string) =>
      ipcRenderer.invoke('fs:stat', filePath),
    listDirectory: (dirPath: string) =>
      ipcRenderer.invoke('fs:listDirectory', dirPath),
    findFiles: (dir: string, pattern: string) =>
      ipcRenderer.invoke('fs:findFiles', dir, pattern),
    copyFile: (src: string, dest: string) =>
      ipcRenderer.invoke('fs:copyFile', src, dest),
    deleteFile: (filePath: string) =>
      ipcRenderer.invoke('fs:deleteFile', filePath)
  },

  crypto: {
    md5: (filePath: string) =>
      ipcRenderer.invoke('crypto:md5', filePath),
    md5Sync: (data: string) =>
      ipcRenderer.invoke('crypto:md5Sync', data)
  },

  path: {
    join: (...paths: string[]) =>
      ipcRenderer.invoke('path:join', ...paths),
    dirname: (filePath: string) =>
      ipcRenderer.invoke('path:dirname', filePath),
    basename: (filePath: string, ext?: string) =>
      ipcRenderer.invoke('path:basename', filePath, ext)
  },

  app: {
    getPath: (name: string) =>
      ipcRenderer.invoke('app:getPath', name),
    getVersion: () =>
      ipcRenderer.invoke('app:version'),
    getName: () =>
      ipcRenderer.invoke('app:name')
  },

  process: {
    platform: () =>
      ipcRenderer.invoke('process:platform'),
    env: () =>
      ipcRenderer.invoke('process:env')
  },

  build: {
    start: (project: FirmwareProject, options: { cleanBuild: boolean; customEnv?: Record<string, string> }) =>
      ipcRenderer.invoke('build:start', project, options),
    cancel: (buildId: string) =>
      ipcRenderer.invoke('build:cancel', buildId),
    onLog: (buildId: string, callback: (log: string) => void) => {
      const handler = (_: unknown, data: string) => callback(data);
      ipcRenderer.on(`build:log:${buildId}`, handler);
      return () => ipcRenderer.removeListener(`build:log:${buildId}`, handler);
    },
    onComplete: (buildId: string, callback: (record: BuildRecord) => void) => {
      const handler = (_: unknown, data: BuildRecord) => callback(data);
      ipcRenderer.on(`build:complete:${buildId}`, handler);
      return () => ipcRenderer.removeListener(`build:complete:${buildId}`, handler);
    }
  },

  compiler: {
    detect: () =>
      ipcRenderer.invoke('compiler:detect'),
    getVersion: (compilerPath: string, versionArg?: string) =>
      ipcRenderer.invoke('compiler:getVersion', compilerPath, versionArg)
  },

  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke('shell:openExternal', url),
    openPath: (filePath: string) =>
      ipcRenderer.invoke('shell:openPath', filePath)
  },

  snapshot: {
    create: (buildId: string, projectPath: string, includeContent?: boolean) =>
      ipcRenderer.invoke('snapshot:create', buildId, projectPath, includeContent)
  },

  firmware: {
    analyzeSections: (firmwarePath: string) =>
      ipcRenderer.invoke('firmware:analyzeSections', firmwarePath)
  },

  files: {
    compareContents: (leftPath: string, rightPath: string) =>
      ipcRenderer.invoke('files:compareContents', leftPath, rightPath)
  },

  risk: {
    preCheck: (projects: any[]) =>
      ipcRenderer.invoke('risk:preCheck', projects)
  },

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
