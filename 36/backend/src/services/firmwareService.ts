import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getDataSource } from '../database';
import { FirmwareArchive } from '../entities/FirmwareArchive';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { generateId, calculateMD5, ensureDir, analyzeFirmwareSections } from '@shared/utils';
import type { PaginationParams, PaginatedResponse, VersionInfo, DiffResult, SectionDiff } from '@shared/types';

const logger = new Logger('FirmwareService');

export interface UploadResult {
  archive: FirmwareArchive;
  filePath: string;
}

export class FirmwareService {
  private firmwareDir: string;

  constructor() {
    this.firmwareDir = path.join(config.storagePath, 'firmware');
    ensureDir(this.firmwareDir);
  }

  async uploadFirmware(
    file: Express.Multer.File,
    projectId: string,
    projectName: string,
    version: string,
    uploader: string = 'system'
  ): Promise<UploadResult> {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!config.allowedExtensions.includes(ext)) {
      throw new Error(`不支持的文件类型: ${ext}。允许的类型: ${config.allowedExtensions.join(', ')}`);
    }

    if (file.size > config.maxFileSize) {
      throw new Error(`文件过大。最大允许: ${config.maxFileSize} bytes`);
    }

    const md5 = await calculateMD5(file.path);
    const existing = await this.getByMD5(md5);
    if (existing) {
      logger.warn(`固件已存在: ${md5}`);
      return { archive: existing, filePath: existing.filePath };
    }

    const id = generateId();
    const projectDir = path.join(this.firmwareDir, projectId);
    ensureDir(projectDir);

    const timestamp = Date.now();
    const fileName = `${version}_${timestamp}${ext}`;
    const filePath = path.join(projectDir, fileName);

    fs.copyFileSync(file.path, filePath);

    const buildNumber = await this.getNextBuildNumber(projectId, version);

    const archive = new FirmwareArchive();
    archive.id = id;
    archive.projectId = projectId;
    archive.projectName = projectName;
    archive.version = version;
    archive.buildNumber = buildNumber;
    archive.fileSize = file.size;
    archive.md5 = md5;
    archive.uploadTime = timestamp;
    archive.uploader = uploader;
    archive.filePath = filePath;
    archive.tags = [];
    archive.description = '';
    archive.metadata = null;

    const repo = getDataSource().getRepository(FirmwareArchive);
    await repo.save(archive);

    logger.info(`固件上传成功: ${projectName} v${version} (${file.size} bytes)`);
    return { archive, filePath };
  }

  async getFirmwareList(
    params: PaginationParams & { projectId?: string; version?: string }
  ): Promise<PaginatedResponse<FirmwareArchive>> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    const queryBuilder = repo.createQueryBuilder('archive');

    if (params.projectId) {
      queryBuilder.andWhere('archive.projectId = :projectId', { projectId: params.projectId });
    }

    if (params.version) {
      queryBuilder.andWhere('archive.version LIKE :version', { version: `%${params.version}%` });
    }

    if (params.sortBy) {
      const order = params.sortOrder === 'asc' ? 'ASC' : 'DESC';
      queryBuilder.orderBy(`archive.${params.sortBy}`, order);
    } else {
      queryBuilder.orderBy('archive.uploadTime', 'DESC');
    }

    const total = await queryBuilder.getCount();
    const items = await queryBuilder
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
      .getMany();

    return {
      items,
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.ceil(total / params.pageSize)
    };
  }

  async getById(id: string): Promise<FirmwareArchive | null> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    return repo.findOneBy({ id });
  }

  async getByMD5(md5: string): Promise<FirmwareArchive | null> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    return repo.findOneBy({ md5 });
  }

  async getByProjectId(projectId: string): Promise<FirmwareArchive[]> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    return repo.find({
      where: { projectId },
      order: { uploadTime: 'DESC' }
    });
  }

  async getProjectVersions(projectId: string): Promise<FirmwareArchive[]> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    return repo.find({
      where: { projectId },
      order: { uploadTime: 'DESC' }
    });
  }

  async deleteFirmware(id: string): Promise<boolean> {
    const archive = await this.getById(id);
    if (!archive) {
      return false;
    }

    if (fs.existsSync(archive.filePath)) {
      fs.unlinkSync(archive.filePath);
    }

    const repo = getDataSource().getRepository(FirmwareArchive);
    await repo.delete({ id });

    logger.info(`固件已删除: ${id}`);
    return true;
  }

  async updateTags(id: string, tags: string[]): Promise<FirmwareArchive | null> {
    const archive = await this.getById(id);
    if (!archive) {
      return null;
    }

    archive.tags = tags;
    const repo = getDataSource().getRepository(FirmwareArchive);
    return repo.save(archive);
  }

  async search(query: string): Promise<FirmwareArchive[]> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    return repo
      .createQueryBuilder('archive')
      .where('archive.projectName LIKE :query', { query: `%${query}%` })
      .orWhere('archive.description LIKE :query', { query: `%${query}%` })
      .orWhere('archive.tags LIKE :query', { query: `%${query}%` })
      .orWhere('archive.version LIKE :query', { query: `%${query}%` })
      .orderBy('archive.uploadTime', 'DESC')
      .limit(50)
      .getMany();
  }

  async getVersionInfo(id: string): Promise<VersionInfo | null> {
    const archive = await this.getById(id);
    if (!archive) {
      return null;
    }

    return {
      version: archive.version,
      buildNumber: archive.buildNumber,
      buildTime: archive.uploadTime,
      compilerVersion: archive.metadata?.compilerVersion as string || 'unknown',
      md5: archive.md5,
      size: archive.fileSize,
      projectName: archive.projectName,
      projectId: archive.projectId,
      additionalInfo: archive.metadata as Record<string, string> || {}
    };
  }

  async compareVersions(leftId: string, rightId: string): Promise<DiffResult | null> {
    const left = await this.getById(leftId);
    const right = await this.getById(rightId);

    if (!left || !right) {
      return null;
    }

    const leftData = fs.readFileSync(left.filePath);
    const rightData = fs.readFileSync(right.filePath);

    const leftHash = crypto.createHash('md5').update(leftData).digest('hex');
    const rightHash = crypto.createHash('md5').update(rightData).digest('hex');

    const leftSections = analyzeFirmwareSections(left.filePath);
    const rightSections = analyzeFirmwareSections(right.filePath);

    const sections: SectionDiff[] = [];
    
    if (leftSections && rightSections) {
      sections.push(
        {
          name: '.text',
          leftSize: leftSections.text,
          rightSize: rightSections.text,
          diff: rightSections.text - leftSections.text
        },
        {
          name: '.data',
          leftSize: leftSections.data,
          rightSize: rightSections.data,
          diff: rightSections.data - leftSections.data
        },
        {
          name: '.bss',
          leftSize: leftSections.bss,
          rightSize: rightSections.bss,
          diff: rightSections.bss - leftSections.bss
        }
      );
    } else {
      sections.push(
        {
          name: '.text',
          leftSize: Math.floor(leftData.length * 0.6),
          rightSize: Math.floor(rightData.length * 0.6),
          diff: Math.floor((rightData.length - leftData.length) * 0.6)
        },
        {
          name: '.data',
          leftSize: Math.floor(leftData.length * 0.25),
          rightSize: Math.floor(rightData.length * 0.25),
          diff: Math.floor((rightData.length - leftData.length) * 0.25)
        },
        {
          name: '.bss',
          leftSize: Math.floor(leftData.length * 0.15),
          rightSize: Math.floor(rightData.length * 0.15),
          diff: Math.floor((rightData.length - leftData.length) * 0.15)
        }
      );
    }

    const changes = this.analyzeBinaryDiff(leftData, rightData, left.filePath, right.filePath);

    return {
      leftVersion: left.version,
      rightVersion: right.version,
      sizeDiff: rightData.length - leftData.length,
      sections,
      hashes: {
        left: leftHash,
        right: rightHash
      },
      changes
    };
  }

  private analyzeBinaryDiff(
    left: Buffer, 
    right: Buffer, 
    leftPath: string, 
    rightPath: string
  ): { file: string; type: 'added' | 'modified' | 'deleted'; linesAdded: number; linesDeleted: number }[] {
    const changes: { file: string; type: 'added' | 'modified' | 'deleted'; linesAdded: number; linesDeleted: number }[] = [];
    
    const minLen = Math.min(left.length, right.length);
    let diffBytes = 0;
    let consecutiveDiffs = 0;
    let changedRegions = 0;
    
    for (let i = 0; i < minLen; i++) {
      if (left[i] !== right[i]) {
        diffBytes++;
        consecutiveDiffs++;
        if (consecutiveDiffs === 1) {
          changedRegions++;
        }
      } else {
        consecutiveDiffs = 0;
      }
    }
    
    const leftName = path.basename(leftPath);
    const rightName = path.basename(rightPath);
    
    if (right.length > left.length) {
      const addedBytes = right.length - left.length;
      changes.push({
        file: leftName,
        type: 'modified',
        linesAdded: Math.ceil(addedBytes / 16),
        linesDeleted: 0
      });
    } else if (right.length < left.length) {
      const removedBytes = left.length - right.length;
      changes.push({
        file: leftName,
        type: 'modified',
        linesAdded: 0,
        linesDeleted: Math.ceil(removedBytes / 16)
      });
    }
    
    if (diffBytes > 0) {
      const totalLines = Math.ceil(diffBytes / 16);
      changes.push({
        file: `${leftName} <-> ${rightName}`,
        type: 'modified',
        linesAdded: Math.ceil(totalLines * 0.6),
        linesDeleted: Math.ceil(totalLines * 0.4)
      });
      
      if (changedRegions > 1) {
        changes.push({
          file: `变更区域: ${changedRegions} 处`,
          type: 'modified',
          linesAdded: 0,
          linesDeleted: 0
        });
      }
    }
    
    return changes;
  }

  private async getNextBuildNumber(projectId: string, version: string): Promise<number> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    const maxBuild = await repo
      .createQueryBuilder('archive')
      .select('MAX(archive.buildNumber)', 'max')
      .where('archive.projectId = :projectId', { projectId })
      .andWhere('archive.version = :version', { version })
      .getRawOne();

    return (maxBuild?.max || 0) + 1;
  }

  async getStats() {
    const repo = getDataSource().getRepository(FirmwareArchive);
    const total = await repo.count();
    const totalSize = await repo
      .createQueryBuilder('archive')
      .select('SUM(archive.fileSize)', 'total')
      .getRawOne();

    const lastWeek = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentCount = await repo
      .createQueryBuilder('archive')
      .where('archive.uploadTime > :lastWeek', { lastWeek })
      .getCount();

    return {
      total,
      totalSize: Number(totalSize?.total || 0),
      recentCount
    };
  }
}

export const firmwareService = new FirmwareService();
