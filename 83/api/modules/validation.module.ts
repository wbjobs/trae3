import { FileValidationResult, ValidationError, FileInfo } from '../../shared/types.js';
import { fileTypeFromBuffer } from 'file-type';
import ExifReader from 'exifreader';
import sharp from 'sharp';

const ALLOWED_MIME_TYPES = [
  'image/tiff',
  'image/tif',
  'image/jpeg',
  'image/png',
  'application/pdf',
];

const ALLOWED_EXTENSIONS = ['.tif', '.tiff', '.jpg', '.jpeg', '.png', '.pdf'];

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

const MIN_DPI = 300;

export class ValidationModule {
  async validateFile(
    fileBuffer: Buffer,
    originalName: string,
    fileSize: number
  ): Promise<FileValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const fileInfo: Partial<FileInfo> = {};

    errors.push(...this.validateFileName(originalName));
    errors.push(...this.validateFileSize(fileSize));

    const extValidation = this.validateExtension(originalName);
    errors.push(...extValidation.errors);

    const mimeValidation = await this.validateMimeType(fileBuffer);
    errors.push(...mimeValidation.errors);
    if (mimeValidation.mimeType) {
      fileInfo.mimeType = mimeValidation.mimeType;
    }

    if (mimeValidation.mimeType?.startsWith('image/')) {
      try {
        const imageInfo = await this.validateImageProperties(fileBuffer);
        errors.push(...imageInfo.errors);
        warnings.push(...imageInfo.warnings);
        Object.assign(fileInfo, imageInfo.info);
      } catch (e) {
        errors.push({
          field: 'image',
          message: '无法解析图像文件',
          code: 'IMAGE_PARSE_ERROR',
        });
      }
    }

    fileInfo.checksum = this.calculateChecksum(fileBuffer);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      fileInfo,
    };
  }

  private validateFileName(fileName: string): ValidationError[] {
    const errors: ValidationError[] = [];
    
    if (!fileName || fileName.trim().length === 0) {
      errors.push({
        field: 'fileName',
        message: '文件名不能为空',
        code: 'EMPTY_FILENAME',
      });
      return errors;
    }

    const invalidChars = /[<>:"/\\|?*\u0000-\u001F]/g;
    if (invalidChars.test(fileName)) {
      errors.push({
        field: 'fileName',
        message: '文件名包含非法字符',
        code: 'INVALID_FILENAME_CHARS',
      });
    }

    if (fileName.length > 255) {
      errors.push({
        field: 'fileName',
        message: '文件名过长（最多255个字符）',
        code: 'FILENAME_TOO_LONG',
      });
    }

    return errors;
  }

  private validateFileSize(fileSize: number): ValidationError[] {
    const errors: ValidationError[] = [];
    
    if (fileSize <= 0) {
      errors.push({
        field: 'fileSize',
        message: '文件为空',
        code: 'EMPTY_FILE',
      });
    } else if (fileSize > MAX_FILE_SIZE) {
      errors.push({
        field: 'fileSize',
        message: `文件过大（最大允许2GB，当前${(fileSize / 1024 / 1024 / 1024).toFixed(2)}GB）`,
        code: 'FILE_TOO_LARGE',
      });
    }

    return errors;
  }

  private validateExtension(fileName: string): { errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      errors.push({
        field: 'extension',
        message: `不支持的文件格式（支持格式：${ALLOWED_EXTENSIONS.join(', ')}）`,
        code: 'UNSUPPORTED_EXTENSION',
      });
    }

    return { errors };
  }

  private async validateMimeType(buffer: Buffer): Promise<{ errors: ValidationError[]; mimeType?: string }> {
    const errors: ValidationError[] = [];
    
    try {
      const type = await fileTypeFromBuffer(buffer);
      
      if (!type) {
        errors.push({
          field: 'mimeType',
          message: '无法识别文件类型',
          code: 'UNKNOWN_FILE_TYPE',
        });
        return { errors };
      }

      if (!ALLOWED_MIME_TYPES.includes(type.mime)) {
        errors.push({
          field: 'mimeType',
          message: `不支持的MIME类型：${type.mime}`,
          code: 'UNSUPPORTED_MIME_TYPE',
        });
      }

      return { errors, mimeType: type.mime };
    } catch (e) {
      errors.push({
        field: 'mimeType',
        message: '文件类型检测失败',
        code: 'MIME_DETECTION_FAILED',
      });
      return { errors };
    }
  }

  private async validateImageProperties(buffer: Buffer): Promise<{
    errors: ValidationError[];
    warnings: ValidationError[];
    info: Partial<FileInfo>;
  }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const info: Partial<FileInfo> = {};

    try {
      const metadata = await sharp(buffer).metadata();
      
      if (metadata.width) info.width = metadata.width;
      if (metadata.height) info.height = metadata.height;
      if (metadata.density) info.dpi = Math.round(metadata.density);
      if (metadata.space) info.colorSpace = metadata.space;

      if (!metadata.width || !metadata.height) {
        errors.push({
          field: 'dimensions',
          message: '无法获取图像尺寸',
          code: 'INVALID_DIMENSIONS',
        });
      }

      if (metadata.density && metadata.density < MIN_DPI) {
        warnings.push({
          field: 'dpi',
          message: `分辨率较低（${Math.round(metadata.density)}DPI），建议不低于${MIN_DPI}DPI`,
          code: 'LOW_DPI',
        });
      }

      if (metadata.space && !['srgb', 'rgb', 'cmyk'].includes(metadata.space.toLowerCase())) {
        warnings.push({
          field: 'colorSpace',
          message: `色彩空间为${metadata.space}，建议使用sRGB或CMYK`,
          code: 'NON_STANDARD_COLOR_SPACE',
        });
      }

      try {
        const exifData = await ExifReader.load(buffer);
        if (exifData) {
          info.colorSpace = exifData['ColorSpace']?.description || info.colorSpace;
        }
      } catch (e) {
      }

    } catch (e) {
      errors.push({
        field: 'image',
        message: '图像属性解析失败',
        code: 'IMAGE_PROPERTIES_PARSE_FAILED',
      });
    }

    return { errors, warnings, info };
  }

  private calculateChecksum(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  validateMetadata(metadata: Record<string, unknown>): { errors: ValidationError[]; warnings: ValidationError[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!metadata['accessionNo'] || String(metadata['accessionNo']).trim() === '') {
      errors.push({
        field: 'accessionNo',
        message: '登记号不能为空',
        code: 'REQUIRED_FIELD',
      });
    }

    if (!metadata['title'] || String(metadata['title']).trim() === '') {
      errors.push({
        field: 'title',
        message: '题名不能为空',
        code: 'REQUIRED_FIELD',
      });
    }

    const accessionNo = String(metadata['accessionNo'] || '');
    if (!/^[A-Za-z0-9\-_]+$/.test(accessionNo)) {
      errors.push({
        field: 'accessionNo',
        message: '登记号只能包含字母、数字、连字符和下划线',
        code: 'INVALID_FORMAT',
      });
    }

    if (metadata['keywords'] && Array.isArray(metadata['keywords'])) {
      if (metadata['keywords'].length === 0) {
        warnings.push({
          field: 'keywords',
          message: '建议添加关键词以便检索',
          code: 'EMPTY_KEYWORDS',
        });
      }
    }

    return { errors, warnings };
  }
}

export const validationModule = new ValidationModule();
