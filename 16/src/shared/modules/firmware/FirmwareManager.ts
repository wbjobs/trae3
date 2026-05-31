import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createModuleLogger } from '../logger';
import { FirmwareValidator } from './FirmwareValidator';
import { Firmware, FirmwareValidationResult, PaginatedResponse, PaginationParams } from '@shared/types';
import { FirmwareEntity } from '@backend/database/entities/Firmware.entity';
import { Repository } from 'typeorm';

const logger = createModuleLogger('FirmwareManager');

export interface FirmwareUploadOptions {
  name: string;
  version: string;
  model: string;
  description?: string;
  uploadedBy: string;
  sourcePath: string;
  targetDir?: string;
}

export class FirmwareManager {
  private firmwareDir: string;
  private validator: FirmwareValidator;
  private repository: Repository<FirmwareEntity> | null = null;

  constructor(firmwareDir?: string) {
    this.firmwareDir = firmwareDir || this.getDefaultFirmwareDir();
    this.validator = new FirmwareValidator();

    if (!fs.existsSync(this.firmwareDir)) {
      fs.mkdirSync(this.firmwareDir, { recursive: true });
    }

    logger.info('init', '固件管理器初始化完成', { firmwareDir: this.firmwareDir });
  }

  private getDefaultFirmwareDir(): string {
    let basePath: string;
    try {
      const { app } = require('electron');
      basePath = app.getPath('userData');
    } catch {
      basePath = process.cwd();
    }
    return path.join(basePath, 'firmwares');
  }

  setRepository(repository: Repository<FirmwareEntity>): void {
    this.repository = repository;
  }

  private getRepository(): Repository<FirmwareEntity> {
    if (!this.repository) {
      throw new Error('数据库仓库未初始化');
    }
    return this.repository;
  }

  private entityToFirmware(entity: FirmwareEntity): Firmware {
    return {
      id: entity.id,
      name: entity.name,
      version: entity.version,
      model: entity.model,
      size: Number(entity.size),
      md5: entity.md5,
      sha256: entity.sha256,
      filePath: entity.filePath,
      uploadTime: entity.uploadTime,
      uploadedBy: entity.uploadedBy,
      description: entity.description
    };
  }

  async uploadFirmware(options: FirmwareUploadOptions): Promise<Firmware> {
    logger.info('upload_firmware', '开始上传固件', {
      name: options.name,
      version: options.version,
      model: options.model,
      sourcePath: options.sourcePath
    });

    const validation = this.validator.validateFirmwareFile(options.sourcePath);
    if (!validation.valid) {
      throw new Error(`固件文件验证失败: ${validation.error}`);
    }

    const [md5, sha256] = await Promise.all([
      this.validator.calculateMD5(options.sourcePath),
      this.validator.calculateSHA256(options.sourcePath)
    ]);

    const firmwareId = uuidv4();
    const fileExt = path.extname(options.sourcePath);
    const targetFileName = `${options.model}_${options.version}_${firmwareId}${fileExt}`;
    const targetPath = path.join(this.firmwareDir, targetFileName);

    await fs.promises.copyFile(options.sourcePath, targetPath);

    const firmware: Firmware = {
      id: firmwareId,
      name: options.name,
      version: options.version,
      model: options.model,
      size: validation.size || 0,
      md5,
      sha256,
      filePath: targetPath,
      uploadTime: new Date(),
      uploadedBy: options.uploadedBy,
      description: options.description
    };

    const repo = this.getRepository();
    const entity = repo.create(firmware);
    await repo.save(entity);

    logger.info('upload_firmware_complete', '固件上传完成', {
      firmwareId,
      name: options.name,
      version: options.version
    });

    return firmware;
  }

  async getFirmwareList(params: PaginationParams & { model?: string; keyword?: string } = { page: 1, pageSize: 20 }): Promise<PaginatedResponse<Firmware>> {
    const repo = this.getRepository();
    const queryBuilder = repo.createQueryBuilder('firmware');

    if (params.model) {
      queryBuilder.andWhere('firmware.model = :model', { model: params.model });
    }

    if (params.keyword) {
      queryBuilder.andWhere('(firmware.name LIKE :keyword OR firmware.version LIKE :keyword)', {
        keyword: `%${params.keyword}%`
      });
    }

    const [entities, total] = await queryBuilder
      .orderBy('firmware.uploadTime', 'DESC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
      .getManyAndCount();

    return {
      items: entities.map(e => this.entityToFirmware(e)),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.ceil(total / params.pageSize)
    };
  }

  async getFirmwareById(id: string): Promise<Firmware | null> {
    const repo = this.getRepository();
    const entity = await repo.findOne({ where: { id } });
    return entity ? this.entityToFirmware(entity) : null;
  }

  async getFirmwareByModelAndVersion(model: string, version: string): Promise<Firmware | null> {
    const repo = this.getRepository();
    const entity = await repo.findOne({ where: { model, version } });
    return entity ? this.entityToFirmware(entity) : null;
  }

  async getLatestFirmware(model: string): Promise<Firmware | null> {
    const repo = this.getRepository();
    const entities = await repo.find({
      where: { model },
      order: { uploadTime: 'DESC' },
      take: 1
    });

    if (entities.length === 0) return null;

    let latest = entities[0];
    for (const entity of entities) {
      if (this.validator.versionCompare(entity.version, latest.version) > 0) {
        latest = entity;
      }
    }

    return this.entityToFirmware(latest);
  }

  async deleteFirmware(id: string): Promise<boolean> {
    const repo = this.getRepository();
    const entity = await repo.findOne({ where: { id } });

    if (!entity) {
      logger.warn('delete_firmware', '固件不存在', { firmwareId: id });
      return false;
    }

    try {
      if (fs.existsSync(entity.filePath)) {
        await fs.promises.unlink(entity.filePath);
      }
    } catch (error) {
      logger.error('delete_firmware_file', '删除固件文件失败', {
        firmwareId: id,
        filePath: entity.filePath,
        error: (error as Error).message
      });
    }

    await repo.delete(id);

    logger.info('delete_firmware_complete', '固件删除完成', { firmwareId: id });
    return true;
  }

  async validateFirmwareIntegrity(id: string): Promise<FirmwareValidationResult> {
    const firmware = await this.getFirmwareById(id);
    if (!firmware) {
      return {
        valid: false,
        error: '固件不存在',
        errors: ['固件不存在']
      };
    }

    const result = await this.validator.verifyIntegrity(firmware);
    return {
      ...result,
      errors: result.error ? [result.error] : []
    };
  }

  async getFirmwareVersions(model: string): Promise<Firmware[]> {
    const repo = this.getRepository();
    const entities = await repo.find({
      where: { model },
      order: { uploadTime: 'DESC' }
    });

    return entities
      .map(e => this.entityToFirmware(e))
      .sort((a, b) => this.validator.versionCompare(b.version, a.version));
  }

  async checkUpdateAvailable(model: string, currentVersion: string): Promise<Firmware | null> {
    const latest = await this.getLatestFirmware(model);
    if (!latest) return null;

    if (this.validator.versionCompare(latest.version, currentVersion) > 0) {
      return latest;
    }

    return null;
  }

  getFirmwareDir(): string {
    return this.firmwareDir;
  }
}

export const createFirmwareManager = (firmwareDir?: string): FirmwareManager => {
  return new FirmwareManager(firmwareDir);
};

export default FirmwareManager;
