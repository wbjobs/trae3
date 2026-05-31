import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  parser: {
    parse: (content: string, format: string) =>
      ipcRenderer.invoke('parser:parse', content, format),
    validate: (content: string, format: string) =>
      ipcRenderer.invoke('parser:validate', content, format),
  },

  converter: {
    convert: (content: string, sourceFormat: string, targetFormat: string) =>
      ipcRenderer.invoke('converter:convert', content, sourceFormat, targetFormat),
  },

  files: {
    import: (name: string, content: string, format: string) =>
      ipcRenderer.invoke('files:import', name, content, format),
    list: () => ipcRenderer.invoke('files:list'),
    get: (id: string) => ipcRenderer.invoke('files:get', id),
    read: (id: string) => ipcRenderer.invoke('files:read', id),
    readVersion: (id: string, version: number) =>
      ipcRenderer.invoke('files:readVersion', id, version),
    update: (id: string, content: string, description: string) =>
      ipcRenderer.invoke('files:update', id, content, description),
    delete: (id: string) => ipcRenderer.invoke('files:delete', id),
    versions: (id: string) => ipcRenderer.invoke('files:versions', id),
    search: (query: string, format?: string) =>
      ipcRenderer.invoke('files:search', query, format),
    openDialog: () => ipcRenderer.invoke('files:openDialog'),
    saveDialog: () => ipcRenderer.invoke('files:saveDialog'),
  },

  sync: {
    start: () => ipcRenderer.invoke('sync:start'),
    stop: () => ipcRenderer.invoke('sync:stop'),
    status: () => ipcRenderer.invoke('sync:status'),
    resolveConflict: (conflictId: string, resolution: string) =>
      ipcRenderer.invoke('sync:resolveConflict', conflictId, resolution),
  },

  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (updates: any) => ipcRenderer.invoke('config:update', updates),
    reset: () => ipcRenderer.invoke('config:reset'),
  },

  stats: {
    get: () => ipcRenderer.invoke('stats:get'),
  },
});
