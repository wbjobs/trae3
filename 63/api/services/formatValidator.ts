import type { FileType } from '../../shared/types.js';

export class FormatValidator {
  private static validExtensions: Record<FileType, string[]> = {
    DWG: ['.dwg'],
    SHP: ['.shp', '.shx', '.dbf'],
    GDB: ['.gdb'],
    TIF: ['.tif', '.tiff'],
    OTHER: []
  };

  private static maxFileSizes: Record<FileType, number> = {
    DWG: 2 * 1024 * 1024 * 1024,
    SHP: 2 * 1024 * 1024 * 1024,
    GDB: 5 * 1024 * 1024 * 1024,
    TIF: 10 * 1024 * 1024 * 1024,
    OTHER: 1 * 1024 * 1024 * 1024
  };

  static detectFileType(fileName: string): FileType {
    const ext = fileName.split('.').pop()?.toUpperCase() || '';
    switch (ext) {
      case 'DWG': return 'DWG';
      case 'SHP': return 'SHP';
      case 'GDB': return 'GDB';
      case 'TIF':
      case 'TIFF': return 'TIF';
      default: return 'OTHER';
    }
  }

  static validateFile(fileName: string, fileSize: number): {
    valid: boolean;
    fileType: FileType;
    errors: string[];
  } {
    const errors: string[] = [];
    const fileType = this.detectFileType(fileName);

    if (fileType === 'OTHER') {
      errors.push('不支持的文件格式');
    }

    const maxSize = this.maxFileSizes[fileType];
    if (fileSize > maxSize) {
      errors.push(`文件大小超过限制 (最大 ${maxSize / 1024 / 1024 / 1024} GB)`);
    }

    const namePattern = /^[a-zA-Z0-9\u4e00-\u9fa5_-]+\.[a-zA-Z0-9]+$/;
    if (!namePattern.test(fileName)) {
      errors.push('文件名包含非法字符');
    }

    return {
      valid: errors.length === 0,
      fileType,
      errors
    };
  }

  static validateMetadata(metadata: {
    projectName: string;
    coordinateSystem: string;
    scale: string;
    surveyArea: string;
  }): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!metadata.projectName || metadata.projectName.trim().length === 0) {
      errors.push('项目名称不能为空');
    }
    if (!metadata.coordinateSystem) {
      errors.push('坐标系不能为空');
    }
    if (!metadata.scale) {
      const scalePattern = /^1:\d+$/;
      if (!scalePattern.test(metadata.scale)) {
        errors.push('比例尺格式不正确');
      }
    }
    if (!metadata.surveyArea || metadata.surveyArea.trim().length === 0) {
      errors.push('测区范围不能为空');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export default FormatValidator;
