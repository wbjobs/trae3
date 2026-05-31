import { parseSemver } from '../../utils';

export interface SemverCompareOptions {
  allowDowngrade?: boolean;
  allowPrerelease?: boolean;
}

export class FirmwareVersionUtils {
  static parse(version: string): { major: number; minor: number; patch: number; prerelease?: string } {
    return parseSemver(version);
  }

  static compare(v1: string, v2: string): number {
    const sem1 = parseSemver(v1);
    const sem2 = parseSemver(v2);

    if (sem1.major !== sem2.major) return sem1.major - sem2.major;
    if (sem1.minor !== sem2.minor) return sem1.minor - sem2.minor;
    if (sem1.patch !== sem2.patch) return sem1.patch - sem2.patch;

    if (sem1.prerelease && !sem2.prerelease) return -1;
    if (!sem1.prerelease && sem2.prerelease) return 1;
    if (sem1.prerelease && sem2.prerelease) {
      return sem1.prerelease.localeCompare(sem2.prerelease);
    }

    return 0;
  }

  static isNewer(v1: string, v2: string): boolean {
    return this.compare(v1, v2) > 0;
  }

  static isSameOrNewer(v1: string, v2: string): boolean {
    return this.compare(v1, v2) >= 0;
  }

  static validateVersionFormat(version: string): { valid: boolean; error?: string } {
    if (!version || version.trim().length === 0) {
      return { valid: false, error: '版本号不能为空' };
    }

    const match = version.match(/^[vV]?(\d+)\.(\d+)\.(\d+)(?:[-.]?([\w.]+))?$/);
    if (!match) {
      return { valid: false, error: '版本号格式不正确，应为 x.y.z 或 vx.y.z 格式' };
    }

    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const patch = parseInt(match[3], 10);

    if (major < 0 || minor < 0 || patch < 0) {
      return { valid: false, error: '版本号各段不能为负数' };
    }

    return { valid: true };
  }

  static canUpgrade(firmwareVersion: string, currentVersion: string, options: SemverCompareOptions = {}): { canUpgrade: boolean; reason?: string } {
    const firmwareValid = this.validateVersionFormat(firmwareVersion);
    if (!firmwareValid.valid) {
      return { canUpgrade: false, reason: firmwareValid.error };
    }

    const currentValid = this.validateVersionFormat(currentVersion);
    if (!currentValid.valid) {
      return { canUpgrade: true };
    }

    if (!options.allowDowngrade && this.compare(firmwareVersion, currentVersion) <= 0) {
      return { canUpgrade: false, reason: `固件版本 ${firmwareVersion} 不高于当前版本 ${currentVersion}` };
    }

    if (!options.allowPrerelease) {
      const sem = parseSemver(firmwareVersion);
      if (sem.prerelease) {
        return { canUpgrade: false, reason: `固件版本 ${firmwareVersion} 是预发布版本` };
      }
    }

    return { canUpgrade: true };
  }
}
