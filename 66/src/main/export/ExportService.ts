import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { Project, ProjectFile, ExportOptions, ExportProgress } from '../../shared/types';
import { DatabaseManager } from '../database/DatabaseManager';
import { EncryptionService } from '../encryption/EncryptionService';

export class ExportService {
  private static instance: ExportService;
  private exportProgress: Map<string, ExportProgress> = new Map();

  public static getInstance(): ExportService {
    if (!ExportService.instance) {
      ExportService.instance = new ExportService();
    }
    return ExportService.instance;
  }

  public async exportProject(
    project: Project,
    outputPath: string,
    options: ExportOptions,
    db: DatabaseManager
  ): Promise<boolean> {
    const progressKey = project.id;
    this.updateProgress(progressKey, {
      status: 'exporting',
      progress: 0,
      totalFiles: project.files.length,
      processedFiles: 0,
      message: '开始导出工程...',
    });

    try {
      const exportData = await this.prepareExportData(project, options, db);

      this.updateProgress(progressKey, {
        status: 'exporting',
        progress: 30,
        totalFiles: project.files.length,
        processedFiles: project.files.length,
        message: '正在打包文件...',
      });

      let content: string | Buffer;
      if (options.compress) {
        this.updateProgress(progressKey, {
          status: 'compressing',
          progress: 50,
          totalFiles: project.files.length,
          processedFiles: project.files.length,
          message: '正在压缩...',
        });
        content = await this.compressToZip(exportData, options.compressionLevel);
      } else {
        content = JSON.stringify(exportData, null, 2);
      }

      if (options.encrypt && options.password) {
        this.updateProgress(progressKey, {
          status: 'encrypting',
          progress: 80,
          totalFiles: project.files.length,
          processedFiles: project.files.length,
          message: '正在加密...',
        });
        const encryption = EncryptionService.getInstance();
        const salt = encryption.generateSalt();
        const contentStr = typeof content === 'string' ? content : content.toString('utf8');
        content = JSON.stringify({
          encrypted: true,
          salt,
          data: encryption.encryptString(contentStr, options.password, salt),
        });
      }

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      if (typeof content === 'string') {
        fs.writeFileSync(outputPath, content, 'utf8');
      } else {
        fs.writeFileSync(outputPath, content);
      }

      this.updateProgress(progressKey, {
        status: 'done',
        progress: 100,
        totalFiles: project.files.length,
        processedFiles: project.files.length,
        message: '导出成功',
      });

      return true;
    } catch (error) {
      this.updateProgress(progressKey, {
        status: 'error',
        progress: 0,
        totalFiles: project.files.length,
        processedFiles: 0,
        message: `导出失败: ${(error as Error).message}`,
      });
      throw error;
    }
  }

  public async batchExport(
    projectIds: string[],
    outputDir: string,
    options: ExportOptions,
    db: DatabaseManager
  ): Promise<string[]> {
    const exportedPaths: string[] = [];
    
    for (let i = 0; i < projectIds.length; i++) {
      const project = db.getProject(projectIds[i]);
      if (project) {
        const safeName = project.name.replace(/[<>:"/\\|?*]/g, '_');
        const outputPath = path.join(outputDir, `${safeName}.${options.compress ? 'zip' : 'json'}`);
        await this.exportProject(project, outputPath, options, db);
        exportedPaths.push(outputPath);
      }
    }
    
    return exportedPaths;
  }

  public async importProject(
    filePath: string,
    password?: string
  ): Promise<Project> {
    let content = fs.readFileSync(filePath, 'utf8');
    let data: Record<string, unknown> = JSON.parse(content);

    if (data.encrypted && data.salt) {
      if (!password) {
        throw new Error('该工程已加密，需要密码');
      }
      const encryption = EncryptionService.getInstance();
      const decrypted = encryption.decryptString(data.data as string, password, data.salt as string);
      data = JSON.parse(decrypted);
    }

    const projectData = data.project as Record<string, unknown>;
    const files = data.files as ProjectFile[];
    const projectName = projectData.name as string;

    const project: Project = {
      id: projectData.id as string,
      name: projectName,
      description: (projectData.description as string) || undefined,
      files: files,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: (projectData.version as string) || '1.0.0',
      isSynced: false,
    };

    return project;
  }

  private async prepareExportData(
    project: Project,
    options: ExportOptions,
    db: DatabaseManager
  ): Promise<Record<string, unknown>> {
    const exportData: Record<string, unknown> = {
      version: '1.0.0',
      exportFormat: 'project-studio-export',
      exportedAt: Date.now(),
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        version: project.version,
      },
      files: project.files.map(file => ({
        id: file.id,
        name: file.name,
        path: file.path,
        content: file.content,
        language: file.language,
        size: file.size,
        lastModified: file.lastModified,
        version: file.version,
      })),
    };

    if (options.includeVersions) {
      exportData.versions = db.listVersions(project.id);
    }

    return exportData;
  }

  private async compressToZip(
    data: Record<string, unknown>,
    compressionLevel: number
  ): Promise<Buffer> {
    const zip = new JSZip();

    zip.file('project.json', JSON.stringify(data.project, null, 2));
    zip.file('metadata.json', JSON.stringify({
      version: data.version,
      exportFormat: data.exportFormat,
      exportedAt: data.exportedAt,
    }, null, 2));

    const files = data.files as ProjectFile[];
    files.forEach(file => {
      zip.file(`files/${file.path}`, file.content);
    });

    if (data.versions) {
      zip.file('versions.json', JSON.stringify(data.versions, null, 2));
    }

    return zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }

  private updateProgress(projectId: string, progress: ExportProgress): void {
    this.exportProgress.set(projectId, progress);
  }

  public getExportProgress(projectId: string): ExportProgress {
    return this.exportProgress.get(projectId) || {
      status: 'idle', progress: 0, totalFiles: 0, processedFiles: 0, message: ''
    };
  }

  public clearExportProgress(projectId: string): void {
    this.exportProgress.delete(projectId);
  }
}
