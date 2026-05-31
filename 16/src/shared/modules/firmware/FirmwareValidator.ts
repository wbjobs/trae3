import * as fs from 'fs';
import * as crypto from 'crypto';
import { createModuleLogger } from '../logger';
import { Firmware, Terminal, FirmwareValidationResult } from '@shared/types';
import { FirmwareVersionUtils, SemverCompareOptions } from './FirmwareVersionUtils';

const logger = createModuleLogger('FirmwareValidator');

export class FirmwareValidator {
  private readonly MAX_FILE_SIZE = 500 * 1024 * 1024;
  private readonly HASH_TIMEOUT_MS = 30000;

  async calculateMD5(filePath: string): Promise<string> {
    return this.calculateHash(filePath, 'md5');
  }

  async calculateSHA256(filePath: string): Promise<string> {
    return this.calculateHash(filePath, 'sha256');
  }

  private async calculateHash(filePath: string, algorithm: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Hash calculation timeout for ${algorithm}`));
      }, this.HASH_TIMEOUT_MS);

      try {
        const hash = crypto.createHash(algorithm);
        const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });

        stream.on('data', (data) => {
          hash.update(data);
        });

        stream.on('end', () => {
          clearTimeout(timeout);
          resolve(hash.digest('hex'));
        });

        stream.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async verifyIntegrity(firmware: Firmware): Promise<FirmwareValidationResult> {
    try {
      if (!fs.existsSync(firmware.filePath)) {
        return { valid: false, error: '固件文件不存在' };
      }

      const stats = fs.statSync(firmware.filePath);
      if (stats.size === 0) {
        return { valid: false, error: '固件文件为空' };
      }
      if (stats.size > this.MAX_FILE_SIZE) {
        return { valid: false, error: '固件文件超过大小限制' };
      }

      const actualMD5 = await this.calculateMD5(firmware.filePath);
      if (firmware.md5 && actualMD5.toLowerCase() !== firmware.md5.toLowerCase()) {
        return {
          valid: false,
          error: `MD5校验不匹配，期望 ${firmware.md5}，实际 ${actualMD5}`
        };
      }

      if (firmware.sha256) {
        const actualSHA256 = await this.calculateSHA256(firmware.filePath);
        if (actualSHA256.toLowerCase() !== firmware.sha256.toLowerCase()) {
          return {
            valid: false,
            error: `SHA256校验不匹配，期望 ${firmware.sha256}，实际 ${actualSHA256}`
          };
        }
      }

      logger.info('verify_integrity', '固件完整性校验通过', { firmwareId: firmware.id });
      return { valid: true };
    } catch (error) {
      const message = (error as Error).message;
      logger.error('verify_integrity_error', '固件完整性校验失败', {
        firmwareId: firmware.id,
        error: message
      });
      return { valid: false, error: message };
    }
  }

  validateFirmware(
    firmware: Firmware,
    terminal: Terminal,
    options: SemverCompareOptions = {}
  ): FirmwareValidationResult {
    const versionCheck = FirmwareVersionUtils.canUpgrade(
      firmware.version,
      terminal.firmwareVersion,
      options
    );

    if (!versionCheck.canUpgrade) {
      return { valid: false, error: versionCheck.reason };
    }

    if (firmware.model && terminal.model) {
      if (!this.checkModelCompatibility(firmware.model, terminal.model)) {
        return {
          valid: false,
          error: `固件型号 ${firmware.model} 与终端型号 ${terminal.model} 不兼容`
        };
      }
    }

    return { valid: true };
  }

  private checkModelCompatibility(firmwareModel: string, terminalModel: string): boolean {
    if (firmwareModel === '*' || firmwareModel === terminalModel) {
      return true;
    }
    const firmwarePrefix = firmwareModel.split('-')[0];
    const terminalPrefix = terminalModel.split('-')[0];
    return firmwarePrefix === terminalPrefix;
  }

  versionCompare(v1: string, v2: string): number {
    return FirmwareVersionUtils.compare(v1, v2);
  }

  validateFirmwareFile(filePath: string): { valid: boolean; error?: string; size?: number } {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, error: '文件不存在' };
      }

      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return { valid: false, error: '不是有效的文件' };
      }

      if (stats.size === 0) {
        return { valid: false, error: '文件为空' };
      }

      if (stats.size > this.MAX_FILE_SIZE) {
        return { valid: false, error: `文件超过大小限制 (${this.MAX_FILE_SIZE / 1024 / 1024}MB)` };
      }

      const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
      const allowedExts = ['.bin', '.img', '.hex', '.zip'];
      if (!allowedExts.includes(ext)) {
        return { valid: false, error: '不支持的文件格式' };
      }

      return { valid: true, size: stats.size };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }
}

export const createFirmwareValidator = (): FirmwareValidator => {
  return new FirmwareValidator();
};

export default FirmwareValidator;
