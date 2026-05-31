import crypto from 'crypto-js';
import { Project, ProjectFile } from '../../shared/types';

export class EncryptionService {
  private static instance: EncryptionService;
  private keyDerivationIterations = 100000;

  public static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  private deriveKey(password: string, salt: string): string {
    const key = crypto.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations: this.keyDerivationIterations,
      hasher: crypto.algo.SHA256,
    });
    return key.toString();
  }

  public generateSalt(): string {
    return crypto.lib.WordArray.random(16).toString();
  }

  public encryptString(data: string, password: string, salt: string): string {
    const key = this.deriveKey(password, salt);
    return crypto.AES.encrypt(data, key).toString();
  }

  public decryptString(encryptedData: string, password: string, salt: string): string {
    try {
      const key = this.deriveKey(password, salt);
      const bytes = crypto.AES.decrypt(encryptedData, key);
      return bytes.toString(crypto.enc.Utf8);
    } catch {
      throw new Error('解密失败：密码错误或数据已损坏');
    }
  }

  public encryptProject(project: Project, password: string): Project {
    const salt = this.generateSalt();
    const key = this.deriveKey(password, salt);

    const encryptedFiles = project.files.map((file) => ({
      ...file,
      content: crypto.AES.encrypt(file.content, key).toString(),
      isEncrypted: true,
    } as ProjectFile & { isEncrypted?: boolean }));

    return {
      ...project,
      files: encryptedFiles as ProjectFile[],
      isEncrypted: true,
      encryptionSalt: salt,
    };
  }

  public decryptProject(project: Project, password: string): Project {
    if (!project.isEncrypted || !project.encryptionSalt) {
      return project;
    }

    try {
      const key = this.deriveKey(password, project.encryptionSalt);

      const decryptedFiles = project.files.map((file) => {
        try {
          const bytes = crypto.AES.decrypt(file.content, key);
          return {
            ...file,
            content: bytes.toString(crypto.enc.Utf8),
          };
        } catch {
          return file;
        }
      });

      return {
        ...project,
        files: decryptedFiles,
        isEncrypted: false,
        encryptionSalt: undefined,
      };
    } catch {
      throw new Error('解密失败：密码错误或项目数据已损坏');
    }
  }

  public verifyPassword(project: Project, password: string): boolean {
    if (!project.isEncrypted || !project.encryptionSalt) {
      return true;
    }

    try {
      const key = this.deriveKey(password, project.encryptionSalt);
      const testFile = project.files[0];
      if (testFile) {
        crypto.AES.decrypt(testFile.content, key).toString(crypto.enc.Utf8);
      }
      return true;
    } catch {
      return false;
    }
  }

  public encryptFile(file: ProjectFile, password: string, salt: string): ProjectFile {
    const key = this.deriveKey(password, salt);
    return {
      ...file,
      content: crypto.AES.encrypt(file.content, key).toString(),
    };
  }

  public decryptFile(file: ProjectFile, password: string, salt: string): ProjectFile {
    try {
      const key = this.deriveKey(password, salt);
      const bytes = crypto.AES.decrypt(file.content, key);
      return {
        ...file,
        content: bytes.toString(crypto.enc.Utf8),
      };
    } catch {
      throw new Error('文件解密失败');
    }
  }

  public hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const actualSalt = salt || this.generateSalt();
    const hash = crypto.PBKDF2(password, actualSalt, {
      keySize: 256 / 32,
      iterations: this.keyDerivationIterations,
      hasher: crypto.algo.SHA256,
    }).toString();
    return { hash, salt: actualSalt };
  }
}
