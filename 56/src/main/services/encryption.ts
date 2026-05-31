import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EncryptTask, DecryptTask, EncryptionKey } from '@shared/types';
import {
  ENCRYPTION_ALGORITHM,
  ENCRYPTION_KEY_SIZE,
  ENCRYPTION_IV_SIZE,
  ENCRYPTION_AUTH_TAG_SIZE,
  ENCRYPTION_SALT_SIZE,
  ENCRYPTED_FILE_EXT,
} from '@shared/constants';

interface KeyStore {
  keys: Array<{
    id: string;
    name: string;
    key: string;
    createdAt: string;
    lastUsed?: string;
    isActive: boolean;
  }>;
}

class DrawingEncryptionService {
  private tasks: Map<string, EncryptTask | DecryptTask> = new Map();
  private keyStorePath: string = '';
  private keyStore: KeyStore = { keys: [] };
  private progressHandler: ((task: EncryptTask | DecryptTask) => void) | null = null;
  private isInitialized = false;
  private concurrentLimit = 4;
  private activeWorkers = 0;
  private pendingQueue: Array<() => Promise<void>> = [];

  async initialize(userDataPath: string): Promise<void> {
    if (this.isInitialized) return;

    this.keyStorePath = path.join(userDataPath, 'encryption', 'keystore.json');
    await fs.ensureDir(path.dirname(this.keyStorePath));

    if (await fs.pathExists(this.keyStorePath)) {
      try {
        this.keyStore = await fs.readJson(this.keyStorePath);
      } catch {
        this.keyStore = { keys: [] };
      }
    }

    this.concurrentLimit = Math.max(2, Math.min(8, Math.ceil(require('os').cpus().length / 2)));
    this.isInitialized = true;
  }

  setProgressHandler(handler: (task: EncryptTask | DecryptTask) => void): void {
    this.progressHandler = handler;
  }

  listKeys(): EncryptionKey[] {
    return this.keyStore.keys.map((k) => ({
      id: k.id,
      name: k.name,
      createdAt: k.createdAt,
      lastUsed: k.lastUsed,
      isActive: k.isActive,
    }));
  }

  async createKey(name: string): Promise<EncryptionKey> {
    const key = crypto.randomBytes(ENCRYPTION_KEY_SIZE).toString('hex');
    const newKey = {
      id: uuidv4(),
      name,
      key,
      createdAt: new Date().toISOString(),
      isActive: this.keyStore.keys.length === 0,
    };

    this.keyStore.keys.push(newKey);
    await this.saveKeyStore();

    return {
      id: newKey.id,
      name: newKey.name,
      createdAt: newKey.createdAt,
      isActive: newKey.isActive,
    };
  }

  async deleteKey(keyId: string): Promise<boolean> {
    const index = this.keyStore.keys.findIndex((k) => k.id === keyId);
    if (index === -1) return false;

    this.keyStore.keys.splice(index, 1);
    await this.saveKeyStore();
    return true;
  }

  private async saveKeyStore(): Promise<void> {
    await fs.writeJson(this.keyStorePath, this.keyStore, { spaces: 2 });
  }

  private getKey(keyId?: string): Buffer {
    let keyEntry;
    if (keyId) {
      keyEntry = this.keyStore.keys.find((k) => k.id === keyId);
    } else {
      keyEntry = this.keyStore.keys.find((k) => k.isActive) || this.keyStore.keys[0];
    }

    if (!keyEntry) {
      throw new Error('没有可用的加密密钥，请先创建密钥');
    }

    keyEntry.lastUsed = new Date().toISOString();
    this.saveKeyStore().catch(() => {});

    return Buffer.from(keyEntry.key, 'hex');
  }

  async encryptFile(
    sourcePath: string,
    outputPath?: string,
    keyId?: string
  ): Promise<EncryptTask> {
    const task: EncryptTask = {
      id: uuidv4(),
      sourcePath,
      outputPath: outputPath || sourcePath + ENCRYPTED_FILE_EXT,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.tasks.set(task.id, task);
    this.queueTask(() => this.processEncryption(task, keyId));

    return task;
  }

  async batchEncrypt(
    sourcePaths: string[],
    outputDir?: string,
    keyId?: string
  ): Promise<EncryptTask[]> {
    const tasks: EncryptTask[] = [];

    for (const sourcePath of sourcePaths) {
      let outputPath: string | undefined;
      if (outputDir) {
        const fileName = path.basename(sourcePath) + ENCRYPTED_FILE_EXT;
        outputPath = path.join(outputDir, fileName);
        await fs.ensureDir(outputDir);
      }

      const task = await this.encryptFile(sourcePath, outputPath, keyId);
      tasks.push(task);
    }

    return tasks;
  }

  async decryptFile(
    sourcePath: string,
    outputPath?: string,
    keyId?: string
  ): Promise<DecryptTask> {
    const task: DecryptTask = {
      id: uuidv4(),
      sourcePath,
      outputPath: outputPath || sourcePath.replace(ENCRYPTED_FILE_EXT, ''),
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.tasks.set(task.id, task);
    this.queueTask(() => this.processDecryption(task, keyId));

    return task;
  }

  private queueTask(taskFn: () => Promise<void>): void {
    if (this.activeWorkers < this.concurrentLimit) {
      this.activeWorkers++;
      taskFn().finally(() => {
        this.activeWorkers--;
        this.processNextQueue();
      });
    } else {
      this.pendingQueue.push(taskFn);
    }
  }

  private processNextQueue(): void {
    if (this.pendingQueue.length > 0 && this.activeWorkers < this.concurrentLimit) {
      const nextTask = this.pendingQueue.shift();
      if (nextTask) {
        this.activeWorkers++;
        nextTask().finally(() => {
          this.activeWorkers--;
          this.processNextQueue();
        });
      }
    }
  }

  private async processEncryption(task: EncryptTask, keyId?: string): Promise<void> {
    try {
      this.updateTaskStatus(task.id, 'processing', 0);

      const key = this.getKey(keyId);
      const salt = crypto.randomBytes(ENCRYPTION_SALT_SIZE);
      const iv = crypto.randomBytes(ENCRYPTION_IV_SIZE);

      const derivedKey = crypto.pbkdf2Sync(
        key,
        salt,
        100000,
        ENCRYPTION_KEY_SIZE,
        'sha256'
      );

      const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);

      const input = fs.createReadStream(task.sourcePath, { highWaterMark: 64 * 1024 });
      const output = fs.createWriteStream(task.outputPath!);

      output.write(salt);
      output.write(iv);

      const fileSize = (await fs.stat(task.sourcePath)).size;
      let processed = 0;

      await new Promise<void>((resolve, reject) => {
        input.on('data', (chunk: string | Buffer) => {
          const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
          const encrypted = cipher.update(buffer);
          output.write(encrypted);
          processed += buffer.length;
          const progress = Math.round((processed / fileSize) * 90);
          this.updateTaskStatus(task.id, 'processing', progress);
        });

        input.on('end', () => {
          const final = cipher.final();
          output.write(final);
          const authTag = cipher.getAuthTag();
          output.write(authTag);
          output.end();
        });

        input.on('error', reject);
        output.on('finish', resolve);
        output.on('error', reject);
      });

      const encryptedHash = await this.computeFileHash(task.outputPath!);

      this.updateTaskStatus(task.id, 'completed', 100, undefined, encryptedHash);
    } catch (err: any) {
      this.updateTaskStatus(task.id, 'failed', 0, err.message);
    }
  }

  private async processDecryption(task: DecryptTask, keyId?: string): Promise<void> {
    try {
      this.updateTaskStatus(task.id, 'processing', 0);

      const key = this.getKey(keyId);
      const fileSize = (await fs.stat(task.sourcePath)).size;

      const headerSize = ENCRYPTION_SALT_SIZE + ENCRYPTION_IV_SIZE;
      const payloadSize = fileSize - headerSize - ENCRYPTION_AUTH_TAG_SIZE;

      if (payloadSize <= 0) {
        throw new Error('文件格式无效或已损坏');
      }

      const fd = await fs.open(task.sourcePath, 'r');
      try {
        const salt = Buffer.alloc(ENCRYPTION_SALT_SIZE);
        const iv = Buffer.alloc(ENCRYPTION_IV_SIZE);

        await fs.read(fd, salt, 0, ENCRYPTION_SALT_SIZE, 0);
        await fs.read(fd, iv, 0, ENCRYPTION_IV_SIZE, ENCRYPTION_SALT_SIZE);

        const derivedKey = crypto.pbkdf2Sync(
          key,
          salt,
          100000,
          ENCRYPTION_KEY_SIZE,
          'sha256'
        );

        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);

        const authTag = Buffer.alloc(ENCRYPTION_AUTH_TAG_SIZE);
        await fs.read(
          fd,
          authTag,
          0,
          ENCRYPTION_AUTH_TAG_SIZE,
          fileSize - ENCRYPTION_AUTH_TAG_SIZE
        );
        decipher.setAuthTag(authTag);

        const input = fs.createReadStream(task.sourcePath, {
          start: headerSize,
          end: fileSize - ENCRYPTION_AUTH_TAG_SIZE - 1,
          highWaterMark: 64 * 1024,
        });

        const output = fs.createWriteStream(task.outputPath!);

        let processed = 0;

        await new Promise<void>((resolve, reject) => {
          input.on('data', (chunk: string | Buffer) => {
            const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
            const decrypted = decipher.update(buffer);
            output.write(decrypted);
            processed += buffer.length;
            const progress = Math.round((processed / payloadSize) * 90);
            this.updateTaskStatus(task.id, 'processing', progress);
          });

          input.on('end', () => {
            try {
              const final = decipher.final();
              output.write(final);
              output.end();
            } catch (e: any) {
              reject(new Error('解密失败：密钥错误或文件已损坏'));
            }
          });

          input.on('error', reject);
          output.on('finish', resolve);
          output.on('error', reject);
        });

        this.updateTaskStatus(task.id, 'completed', 100);
      } finally {
        await fs.close(fd);
      }
    } catch (err: any) {
      if (await fs.pathExists(task.outputPath!)) {
        await fs.remove(task.outputPath!).catch(() => {});
      }
      this.updateTaskStatus(task.id, 'failed', 0, err.message);
    }
  }

  private updateTaskStatus(
    taskId: string,
    status: EncryptTask['status'],
    progress: number,
    error?: string,
    encryptedHash?: string
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = status;
    task.progress = progress;

    if (error) task.error = error;
    if (encryptedHash && 'encryptedHash' in task) {
      (task as EncryptTask).encryptedHash = encryptedHash;
    }

    if (this.progressHandler) {
      this.progressHandler(task);
    }
  }

  getTask(taskId: string): EncryptTask | DecryptTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): (EncryptTask | DecryptTask)[] {
    return Array.from(this.tasks.values());
  }

  private async computeFileHash(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  getQueueStats(): { pending: number; active: number } {
    return {
      pending: this.pendingQueue.length,
      active: this.activeWorkers,
    };
  }
}

export const drawingEncryptionService = new DrawingEncryptionService();
