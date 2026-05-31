import * as fs from 'fs';
import * as crypto from 'crypto';
import { getDataSource } from '../database';
import { FirmwareArchive } from '../entities/FirmwareArchive';
import { Logger } from '../utils/logger';
import { calculateMD5, isValidVersion, compareVersions } from '@shared/utils';

const logger = new Logger('VersionService');

export interface ValidationResult {
  valid: boolean;
  md5: string;
  size: number;
  errors: string[];
  warnings: string[];
}

export class VersionService {
  async validateFirmware(id: string): Promise<ValidationResult> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    const archive = await repo.findOneBy({ id });

    const result: ValidationResult = {
      valid: true,
      md5: '',
      size: 0,
      errors: [],
      warnings: []
    };

    if (!archive) {
      result.valid = false;
      result.errors.push('固件不存在');
      return result;
    }

    if (!fs.existsSync(archive.filePath)) {
      result.valid = false;
      result.errors.push(`文件不存在: ${archive.filePath}`);
      return result;
    }

    const stat = fs.statSync(archive.filePath);
    result.size = stat.size;

    const currentMd5 = await calculateMD5(archive.filePath);
    result.md5 = currentMd5;

    if (currentMd5 !== archive.md5) {
      result.valid = false;
      result.errors.push(`MD5 校验失败！期望: ${archive.md5}, 实际: ${currentMd5}`);
      logger.error(`MD5 mismatch for firmware ${id}`);
    }

    if (stat.size !== archive.fileSize) {
      result.valid = false;
      result.errors.push(`文件大小不匹配！期望: ${archive.fileSize}, 实际: ${stat.size}`);
    }

    if (!isValidVersion(archive.version)) {
      result.warnings.push(`版本号格式不规范: ${archive.version}`);
    }

    if (archive.fileSize === 0) {
      result.valid = false;
      result.errors.push('文件大小为0');
    }

    const allowedSignatures = [
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from([0x0d, 0x0a]),
      Buffer.from([0x3a])
    ];

    try {
      const header = Buffer.alloc(4);
      const fd = fs.openSync(archive.filePath, 'r');
      fs.readSync(fd, header, 0, 4, 0);
      fs.closeSync(fd);

      const validSignature = allowedSignatures.some(sig => 
        header.slice(0, sig.length).equals(sig)
      );

      if (!validSignature && archive.fileSize > 100) {
        result.warnings.push('文件头格式可能不规范');
      }
    } catch (error) {
      result.warnings.push('无法读取文件头进行校验');
    }

    if (result.valid) {
      logger.info(`固件校验通过: ${id}`);
    } else {
      logger.warn(`固件校验失败: ${id}`, undefined, { errors: result.errors });
    }

    return result;
  }

  async validateVersionFormat(version: string): Promise<{ valid: boolean; message: string }> {
    if (!version) {
      return { valid: false, message: '版本号不能为空' };
    }

    if (!isValidVersion(version)) {
      return {
        valid: false,
        message: '版本号格式不正确，请使用 MAJOR.MINOR.PATCH 格式，例如: 1.0.0'
      };
    }

    return { valid: true, message: '版本号格式正确' };
  }

  async checkVersionExists(projectId: string, version: string): Promise<boolean> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    const count = await repo.count({ where: { projectId, version } });
    return count > 0;
  }

  async getNextVersion(projectId: string, increment: 'major' | 'minor' | 'patch' = 'patch'): Promise<string> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    const latest = await repo
      .createQueryBuilder('archive')
      .where('archive.projectId = :projectId', { projectId })
      .orderBy('archive.uploadTime', 'DESC')
      .limit(1)
      .getOne();

    if (!latest) {
      return '1.0.0';
    }

    const parts = latest.version.split('.').map(Number);
    while (parts.length < 3) parts.push(0);

    switch (increment) {
      case 'major':
        parts[0]++;
        parts[1] = 0;
        parts[2] = 0;
        break;
      case 'minor':
        parts[1]++;
        parts[2] = 0;
        break;
      case 'patch':
        parts[2]++;
        break;
    }

    return parts.join('.');
  }

  async compareVersions(v1: string, v2: string): Promise<{ result: number; message: string }> {
    const result = compareVersions(v1, v2);
    let message = '';

    if (result > 0) {
      message = `${v1} 大于 ${v2}`;
    } else if (result < 0) {
      message = `${v1} 小于 ${v2}`;
    } else {
      message = `${v1} 等于 ${v2}`;
    }

    return { result, message };
  }

  async verifyIntegrity(id: string): Promise<{ valid: boolean; details: Record<string, unknown> }> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    const archive = await repo.findOneBy({ id });

    const details: Record<string, unknown> = {};

    if (!archive) {
      return { valid: false, details: { error: '固件不存在' } };
    }

    if (!fs.existsSync(archive.filePath)) {
      return { valid: false, details: { error: '文件不存在', path: archive.filePath } };
    }

    const stat = fs.statSync(archive.filePath);
    const md5 = await calculateMD5(archive.filePath);

    details.sizeMatch = stat.size === archive.fileSize;
    details.md5Match = md5 === archive.md5;
    details.expectedSize = archive.fileSize;
    details.actualSize = stat.size;
    details.expectedMd5 = archive.md5;
    details.actualMd5 = md5;
    details.createdAt = new Date(archive.uploadTime).toISOString();
    details.verifiedAt = new Date().toISOString();

    const valid = details.sizeMatch as boolean && details.md5Match as boolean;

    return { valid, details };
  }

  async batchValidate(ids: string[]): Promise<Record<string, ValidationResult>> {
    const results: Record<string, ValidationResult> = {};

    for (const id of ids) {
      results[id] = await this.validateFirmware(id);
    }

    return results;
  }

  async getVersionTree(projectId: string): Promise<Array<{ version: string; buildNumber: number; uploadTime: number; md5: string; previousVersion: string | null }>> {
    const repo = getDataSource().getRepository(FirmwareArchive);
    const archives = await repo
      .createQueryBuilder('archive')
      .select(['archive.version', 'archive.buildNumber', 'archive.uploadTime', 'archive.md5', 'archive.previousVersion'])
      .where('archive.projectId = :projectId', { projectId })
      .orderBy('archive.uploadTime', 'DESC')
      .getMany();

    const versionMap = new Map<string, typeof archives[0]>();
    
    for (const archive of archives) {
      const key = `${archive.version}-${archive.buildNumber}`;
      if (!versionMap.has(key)) {
        versionMap.set(key, archive);
      }
    }

    return Array.from(versionMap.values())
      .sort((a, b) => compareVersions(b.version, a.version) || b.uploadTime - a.uploadTime)
      .map(a => ({
        version: a.version,
        buildNumber: a.buildNumber,
        uploadTime: a.uploadTime,
        md5: a.md5,
        previousVersion: a.previousVersion
      }));
  }

  async rollbackVersion(
    projectId: string,
    targetVersion: string,
    reason?: string
  ): Promise<{ success: boolean; previousVersion: string; newVersion: string; rollbackId: string; message: string }> {
    const repo = getDataSource().getRepository(FirmwareArchive);

    const currentLatest = await repo
      .createQueryBuilder('archive')
      .where('archive.projectId = :projectId', { projectId })
      .orderBy('archive.uploadTime', 'DESC')
      .limit(1)
      .getOne();

    if (!currentLatest) {
      return {
        success: false,
        previousVersion: '',
        newVersion: targetVersion,
        rollbackId: '',
        message: '当前没有可用版本'
      };
    }

    const targetArchive = await repo
      .createQueryBuilder('archive')
      .where('archive.projectId = :projectId', { projectId })
      .andWhere('archive.version = :version', { version: targetVersion })
      .orderBy('archive.uploadTime', 'DESC')
      .limit(1)
      .getOne();

    if (!targetArchive) {
      return {
        success: false,
        previousVersion: currentLatest.version,
        newVersion: targetVersion,
        rollbackId: '',
        message: `目标版本 ${targetVersion} 不存在`
      };
    }

    if (!fs.existsSync(targetArchive.filePath)) {
      return {
        success: false,
        previousVersion: currentLatest.version,
        newVersion: targetVersion,
        rollbackId: '',
        message: '目标版本文件不存在，无法回滚'
      };
    }

    const integrityResult = await this.verifyIntegrity(targetArchive.id);
    if (!integrityResult.valid) {
      return {
        success: false,
        previousVersion: currentLatest.version,
        newVersion: targetVersion,
        rollbackId: '',
        message: '目标版本完整性校验失败，无法回滚'
      };
    }

    await repo.update({ projectId, isLatest: true }, { isLatest: false });

    const rollbackId = generateId();
    const rollbackArchive = repo.create({
      id: rollbackId,
      projectId: targetArchive.projectId,
      projectName: targetArchive.projectName,
      version: targetVersion,
      buildNumber: targetArchive.buildNumber,
      fileSize: targetArchive.fileSize,
      md5: targetArchive.md5,
      uploadTime: Date.now(),
      uploader: 'rollback',
      filePath: targetArchive.filePath,
      tags: [...(targetArchive.tags || []), 'rollback'],
      description: `从 ${currentLatest.version} 回滚到 ${targetVersion}${reason ? `: ${reason}` : ''}`,
      metadata: {
        rollback: true,
        rolledBackFrom: currentLatest.version,
        rolledBackFromId: currentLatest.id,
        originalArchiveId: targetArchive.id,
        reason: reason || ''
      },
      isLatest: true,
      previousVersion: currentLatest.version,
      rollbackFromId: currentLatest.id
    });

    await repo.save(rollbackArchive);

    logger.info(`版本回滚: ${currentLatest.version} -> ${targetVersion} (项目: ${projectId})`);

    return {
      success: true,
      previousVersion: currentLatest.version,
      newVersion: targetVersion,
      rollbackId,
      message: `已从 ${currentLatest.version} 回滚到 ${targetVersion}`
    };
  }
}

export const versionService = new VersionService();
