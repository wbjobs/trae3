import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { DatabaseManager } from './database/DatabaseManager';
import { SyntaxValidator } from './validation/SyntaxValidator';
import { CloudSyncService } from './cloud/CloudSyncService';
import { CacheManager } from './cache/CacheManager';
import { EncryptionService } from './encryption/EncryptionService';
import { ExportService } from './export/ExportService';
import {
  IPCChannel,
  IPCResponse,
  Project,
  ProjectFile,
  ValidationResult,
  SyncStatus,
  CloudProject,
  VersionInfo,
  AppConfig,
  CacheEntry,
  ExportOptions,
  ExportProgress,
} from '../shared/types';
import { createProjectFile, validatePath } from '../shared/utils';

let mainWindow: BrowserWindow | null = null;
let db: DatabaseManager;
let validator: SyntaxValidator;
let cloudSync: CloudSyncService;
let cacheManager: CacheManager;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'Project Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#1e1e1e',
    show: false,
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializeServices(): Promise<void> {
  db = await DatabaseManager.getInstance();
  const config = db.getConfig();
  validator = SyntaxValidator.getInstance();
  cloudSync = CloudSyncService.getInstance(db, config);
  cacheManager = CacheManager.getInstance(db, config);
  cloudSync.startAutoSync();
}

function setupIPCHandlers(): void {
  ipcMain.handle(
    IPCChannel.PROJECT_NEW,
    async (_, name: string, description?: string): Promise<IPCResponse<Project>> => {
      try {
        const project = db.createProject(name, description);
        return { success: true, data: project };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.PROJECT_OPEN,
    async (_, projectId: string): Promise<IPCResponse<Project | null>> => {
      try {
        const project = db.getProject(projectId);
        return { success: true, data: project };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.PROJECT_SAVE,
    async (_, project: Project): Promise<IPCResponse<void>> => {
      try {
        db.updateProject(project.id, {
          name: project.name,
          description: project.description,
          updatedAt: Date.now(),
        });

        project.files.forEach(file => {
          const existingFile = db.getProjectFiles(project.id).find(f => f.id === file.id);
          if (existingFile) {
            db.updateFile(project.id, file.id, {
              name: file.name,
              path: file.path,
              content: file.content,
              language: file.language,
              size: new TextEncoder().encode(file.content).length,
              lastModified: file.lastModified,
              isDirty: file.isDirty,
            });
          } else {
            db.addFile(project.id, file);
          }
        });

        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.PROJECT_DELETE,
    async (_, projectId: string): Promise<IPCResponse<void>> => {
      try {
        const project = db.getProject(projectId);
        if (project?.cloudId) {
          try {
            await cloudSync.deleteCloudProject(project.cloudId);
          } catch {
            // Ignore cloud deletion errors, still delete local
          }
        }
        db.deleteProject(projectId);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.PROJECT_LIST,
    async (): Promise<IPCResponse<Project[]>> => {
      try {
        const projects = db.listProjects();
        return { success: true, data: projects };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.FILE_READ,
    async (_, projectId: string, filePath: string): Promise<IPCResponse<ProjectFile | null>> => {
      try {
        const files = db.getProjectFiles(projectId);
        const file = files.find(f => f.path === filePath);
        return { success: true, data: file || null };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.FILE_WRITE,
    async (
      _,
      projectId: string,
      name: string,
      filePath: string,
      content: string
    ): Promise<IPCResponse<ProjectFile>> => {
      try {
        if (!validatePath(filePath)) {
          throw new Error('无效的文件路径');
        }

        const existingFiles = db.getProjectFiles(projectId);
        const existingFile = existingFiles.find(f => f.path === filePath);

        if (existingFile) {
          db.updateFile(projectId, existingFile.id, {
            name,
            path: filePath,
            content,
            size: new TextEncoder().encode(content).length,
            lastModified: Date.now(),
            isDirty: true,
          });
          const updatedFile = db.getProjectFiles(projectId).find(f => f.id === existingFile.id)!;
          return { success: true, data: updatedFile };
        } else {
          const newFile = createProjectFile(name, filePath, content);
          db.addFile(projectId, newFile);
          return { success: true, data: newFile };
        }
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.FILE_DELETE,
    async (_, projectId: string, fileId: string): Promise<IPCResponse<void>> => {
      try {
        db.deleteFile(fileId, projectId);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.FILE_RENAME,
    async (
      _,
      projectId: string,
      fileId: string,
      newName: string,
      newPath: string
    ): Promise<IPCResponse<void>> => {
      try {
        if (!validatePath(newPath)) {
          throw new Error('无效的文件路径');
        }

        db.updateFile(projectId, fileId, {
          name: newName,
          path: newPath,
          lastModified: Date.now(),
          isDirty: true,
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.VALIDATE_FILE,
    async (_, file: ProjectFile): Promise<IPCResponse<ValidationResult>> => {
      try {
        const result = validator.validateFile(file);
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.VALIDATE_PROJECT,
    async (_, files: ProjectFile[]): Promise<IPCResponse<ValidationResult[]>> => {
      try {
        const results = validator.validateProject(files);
        return { success: true, data: results };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.SYNC_START,
    async (_, projectId: string): Promise<IPCResponse<void>> => {
      try {
        await cloudSync.syncProject(projectId);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.SYNC_STATUS,
    async (_, projectId: string): Promise<IPCResponse<SyncStatus>> => {
      try {
        const status = cloudSync.getSyncStatus(projectId);
        return { success: true, data: status };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.SYNC_PUSH,
    async (_, projectId: string): Promise<IPCResponse<void>> => {
      try {
        const project = db.getProject(projectId);
        if (!project) throw new Error('项目不存在');

        if (!project.cloudId) {
          await cloudSync.createCloudProject(project);
          const updatedProject = db.getProject(projectId)!;
          await cloudSync.uploadProject(updatedProject);
        } else {
          await cloudSync.uploadProject(project);
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.SYNC_PULL,
    async (_, cloudId: string): Promise<IPCResponse<Project>> => {
      try {
        const project = await cloudSync.downloadProject(cloudId);
        return { success: true, data: project };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.CLOUD_LIST,
    async (): Promise<IPCResponse<CloudProject[]>> => {
      try {
        const projects = await cloudSync.listCloudProjects();
        return { success: true, data: projects };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.CLOUD_GET,
    async (_, cloudId: string): Promise<IPCResponse<CloudProject>> => {
      try {
        const project = await cloudSync.getCloudProject(cloudId);
        return { success: true, data: project };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.CLOUD_CREATE,
    async (_, project: Project): Promise<IPCResponse<CloudProject>> => {
      try {
        const cloudProject = await cloudSync.createCloudProject(project);
        return { success: true, data: cloudProject };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.CLOUD_DELETE,
    async (_, cloudId: string): Promise<IPCResponse<void>> => {
      try {
        await cloudSync.deleteCloudProject(cloudId);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.CACHE_GET,
    async (_, key: string): Promise<IPCResponse<CacheEntry<unknown> | null>> => {
      try {
        const entry = cacheManager.getEntry(key);
        return { success: true, data: entry };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.CACHE_SET,
    async (_, key: string, data: unknown, ttl?: number): Promise<IPCResponse<void>> => {
      try {
        cacheManager.set(key, data, ttl);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.CACHE_CLEAR,
    async (_, key?: string): Promise<IPCResponse<void>> => {
      try {
        if (key) {
          cacheManager.delete(key);
        } else {
          cacheManager.clear();
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.VERSION_LIST,
    async (_, projectId: string, cloudId?: string): Promise<IPCResponse<VersionInfo[]>> => {
      try {
        if (cloudId) {
          const versions = await cloudSync.listVersions(cloudId);
          return { success: true, data: versions };
        } else {
          const versions = db.listVersions(projectId);
          return { success: true, data: versions };
        }
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.VERSION_CREATE,
    async (
      _,
      projectId: string,
      description: string,
      author: string,
      cloudId?: string
    ): Promise<IPCResponse<VersionInfo>> => {
      try {
        if (cloudId) {
          const version = await cloudSync.createVersion(cloudId, description, author);
          return { success: true, data: version };
        } else {
          const version = db.createVersion(projectId, description, author);
          return { success: true, data: version };
        }
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.VERSION_ROLLBACK,
    async (
      _,
      projectId: string,
      version: string,
      cloudId?: string
    ): Promise<IPCResponse<ProjectFile[]>> => {
      try {
        if (cloudId) {
          await cloudSync.rollbackToVersion(cloudId, version);
          const project = await cloudSync.downloadProject(cloudId);
          return { success: true, data: project.files };
        } else {
          const files = db.rollbackToVersion(projectId, version);
          return { success: true, data: files };
        }
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.CONFIG_GET,
    async (): Promise<IPCResponse<AppConfig>> => {
      try {
        const config = db.getConfig();
        return { success: true, data: config };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.CONFIG_SET,
    async (_, config: Partial<AppConfig>): Promise<IPCResponse<void>> => {
      try {
        db.updateConfig(config);
        const newConfig = db.getConfig();
        cloudSync.updateConfig(newConfig);
        cacheManager.updateConfig(newConfig);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.PROJECT_ENCRYPT,
    async (_, projectId: string, password: string): Promise<IPCResponse<Project>> => {
      try {
        const project = db.getProject(projectId);
        if (!project) {
          return { success: false, error: '项目不存在' };
        }
        const encryption = EncryptionService.getInstance();
        const encryptedProject = encryption.encryptProject(project, password);
        db.updateProject(projectId, { isEncrypted: true });
        return { success: true, data: encryptedProject };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.PROJECT_DECRYPT,
    async (_, projectId: string, password: string): Promise<IPCResponse<Project>> => {
      try {
        const project = db.getProject(projectId);
        if (!project) {
          return { success: false, error: '项目不存在' };
        }
        const encryption = EncryptionService.getInstance();
        const decryptedProject = encryption.decryptProject(project, password);
        db.updateProject(projectId, { isEncrypted: false });
        return { success: true, data: decryptedProject };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.PROJECT_EXPORT,
    async (_, projectId: string, outputPath: string, options: ExportOptions): Promise<IPCResponse<void>> => {
      try {
        const project = db.getProject(projectId);
        if (!project) {
          return { success: false, error: '项目不存在' };
        }
        const exportService = ExportService.getInstance();
        await exportService.exportProject(project, outputPath, options, db);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.PROJECT_BATCH_EXPORT,
    async (_, projectIds: string[], outputDir: string, options: ExportOptions): Promise<IPCResponse<string[]>> => {
      try {
        const exportService = ExportService.getInstance();
        const paths = await exportService.batchExport(projectIds, outputDir, options, db);
        return { success: true, data: paths };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPCChannel.PROJECT_IMPORT,
    async (_, filePath: string, password?: string): Promise<IPCResponse<Project>> => {
      try {
        const exportService = ExportService.getInstance();
        const project = await exportService.importProject(filePath, password);
        db.createProject(project.name, project.description);
        project.files.forEach(file => {
          db.addFile(project.id, file);
        });
        const savedProject = db.getProject(project.id);
        return { success: true, data: savedProject! };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle('app:show-dialog', async (_, options: Electron.MessageBoxOptions) => {
    return dialog.showMessageBox(mainWindow!, options);
  });

  ipcMain.handle('app:show-open-dialog', async (_, options: Electron.OpenDialogOptions) => {
    return dialog.showOpenDialog(mainWindow!, options);
  });

  ipcMain.handle('app:show-save-dialog', async (_, options: Electron.SaveDialogOptions) => {
    return dialog.showSaveDialog(mainWindow!, options);
  });
}

app.whenReady().then(async () => {
  await initializeServices();
  setupIPCHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  cloudSync.stopAutoSync();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  cloudSync.stopAutoSync();
  db.close();
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
