import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { createModuleLogger } from '../logger';

const logger = createModuleLogger('FirmwareCrypto');

export interface EncryptionResult {
  encryptedData: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyFingerprint: string;
}

export interface DecryptionResult {
  decryptedData: Buffer;
  verified: boolean;
}

export interface SignatureInfo {
  signature: string;
  algorithm: string;
  keyId: string;
  timestamp: number;
}

export interface FirmwareSignature {
  md5?: string;
  sha256?: string;
  signature?: SignatureInfo;
  encrypted?: boolean;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  keyId: string;
}

export interface CryptoConfig {
  algorithm?: string;
  keyLength?: number;
  signatureAlgorithm?: string;
}

export class FirmwareCrypto {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32;
  private readonly IV_LENGTH = 12;
  private readonly AUTH_TAG_LENGTH = 16;
  private readonly SIGNATURE_ALGORITHM = 'RSA-SHA256';

  private encryptionKey?: Buffer;
  private signingKeyPair?: KeyPair;
  private trustedPublicKeys: Map<string, string> = new Map();

  setEncryptionKey(key: Buffer | string): void {
    if (typeof key === 'string') {
      this.encryptionKey = Buffer.from(key, 'hex');
    } else {
      this.encryptionKey = key;
    }
    logger.info('set_key', '加密密钥已设置', {
      fingerprint: this.getKeyFingerprint(this.encryptionKey)
    });
  }

  generateEncryptionKey(): Buffer {
    const key = crypto.randomBytes(this.KEY_LENGTH);
    logger.info('generate_key', '生成新的加密密钥');
    return key;
  }

  generateSigningKeyPair(): KeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const keyId = this.getKeyFingerprint(Buffer.from(publicKey));
    
    logger.info('generate_keypair', '生成签名密钥对', { keyId });

    return { publicKey, privateKey, keyId };
  }

  setSigningKeyPair(keyPair: KeyPair): void {
    this.signingKeyPair = keyPair;
    this.addTrustedPublicKey(keyPair.keyId, keyPair.publicKey);
    logger.info('set_keypair', '签名密钥对已设置', { keyId: keyPair.keyId });
  }

  addTrustedPublicKey(keyId: string, publicKey: string): void {
    this.trustedPublicKeys.set(keyId, publicKey);
    logger.info('add_trusted_key', '添加受信任公钥', { keyId });
  }

  removeTrustedPublicKey(keyId: string): void {
    this.trustedPublicKeys.delete(keyId);
    logger.info('remove_trusted_key', '移除受信任公钥', { keyId });
  }

  encrypt(data: Buffer): EncryptionResult {
    if (!this.encryptionKey) {
      throw new Error('加密密钥未设置');
    }

    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.encryptionKey, iv);
    
    const encryptedData = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    logger.debug('encrypt', '数据加密完成', {
      originalSize: data.length,
      encryptedSize: encryptedData.length
    });

    return {
      encryptedData,
      iv,
      authTag,
      keyFingerprint: this.getKeyFingerprint(this.encryptionKey)
    };
  }

  decrypt(
    encryptedData: Buffer,
    iv: Buffer,
    authTag: Buffer
  ): DecryptionResult {
    if (!this.encryptionKey) {
      throw new Error('加密密钥未设置');
    }

    try {
      const decipher = crypto.createDecipheriv(this.ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      const decryptedData = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
      ]);

      logger.debug('decrypt', '数据解密完成', {
        encryptedSize: encryptedData.length,
        decryptedSize: decryptedData.length
      });

      return { decryptedData, verified: true };
    } catch (error) {
      logger.error('decrypt_failed', '数据解密失败', {
        error: (error as Error).message
      });
      return { decryptedData: Buffer.from([]), verified: false };
    }
  }

  sign(data: Buffer): SignatureInfo {
    if (!this.signingKeyPair) {
      throw new Error('签名密钥对未设置');
    }

    const signer = crypto.createSign(this.SIGNATURE_ALGORITHM);
    signer.update(data);
    const signature = signer.sign(this.signingKeyPair.privateKey, 'base64');

    const signatureInfo: SignatureInfo = {
      signature,
      algorithm: this.SIGNATURE_ALGORITHM,
      keyId: this.signingKeyPair.keyId,
      timestamp: Date.now()
    };

    logger.info('sign', '数据签名完成', { keyId: signatureInfo.keyId });

    return signatureInfo;
  }

  verify(data: Buffer, signatureInfo: SignatureInfo): boolean {
    const publicKey = this.trustedPublicKeys.get(signatureInfo.keyId);
    if (!publicKey) {
      logger.warn('verify_failed', '未找到对应的公钥', { keyId: signatureInfo.keyId });
      return false;
    }

    try {
      const verifier = crypto.createVerify(signatureInfo.algorithm);
      verifier.update(data);
      const verified = verifier.verify(publicKey, signatureInfo.signature, 'base64');

      if (verified) {
        logger.debug('verify_success', '签名验证通过', { keyId: signatureInfo.keyId });
      } else {
        logger.warn('verify_failed', '签名验证失败', { keyId: signatureInfo.keyId });
      }

      return verified;
    } catch (error) {
      logger.error('verify_error', '签名验证出错', {
        keyId: signatureInfo.keyId,
        error: (error as Error).message
      });
      return false;
    }
  }

  calculateHash(data: Buffer, algorithm: 'md5' | 'sha256' = 'sha256'): string {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  encryptFile(inputPath: string, outputPath: string): Promise<EncryptionResult & { outputPath: string }> {
    return new Promise((resolve, reject) => {
      if (!this.encryptionKey) {
        reject(new Error('加密密钥未设置'));
        return;
      }

      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv(this.ALGORITHM, this.encryptionKey, iv);
      
      const input = fs.createReadStream(inputPath);
      const output = fs.createWriteStream(outputPath);
      
      const chunks: Buffer[] = [];

      input.pipe(cipher).pipe(output);

      cipher.on('data', (chunk) => chunks.push(chunk));

      output.on('finish', () => {
        const authTag = cipher.getAuthTag();
        logger.info('encrypt_file', '文件加密完成', { inputPath, outputPath });
        resolve({
          encryptedData: Buffer.concat(chunks),
          iv,
          authTag,
          keyFingerprint: this.getKeyFingerprint(this.encryptionKey!),
          outputPath
        });
      });

      output.on('error', (err) => {
        logger.error('encrypt_file_failed', '文件加密失败', { error: err.message });
        reject(err);
      });
    });
  }

  decryptFile(
    inputPath: string,
    outputPath: string,
    iv: Buffer,
    authTag: Buffer
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.encryptionKey) {
        reject(new Error('加密密钥未设置'));
        return;
      }

      try {
        const decipher = crypto.createDecipheriv(this.ALGORITHM, this.encryptionKey, iv);
        decipher.setAuthTag(authTag);

        const input = fs.createReadStream(inputPath);
        const output = fs.createWriteStream(outputPath);

        input.pipe(decipher).pipe(output);

        output.on('finish', () => {
          logger.info('decrypt_file', '文件解密完成', { inputPath, outputPath });
          resolve(true);
        });

        output.on('error', (err) => {
          logger.error('decrypt_file_failed', '文件解密失败', { error: err.message });
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  signFile(filePath: string): SignatureInfo {
    const data = fs.readFileSync(filePath);
    return this.sign(data);
  }

  verifyFile(filePath: string, signatureInfo: SignatureInfo): boolean {
    const data = fs.readFileSync(filePath);
    return this.verify(data, signatureInfo);
  }

  exportPublicKey(keyId: string): string | undefined {
    return this.trustedPublicKeys.get(keyId);
  }

  importPublicKey(keyId: string, publicKey: string): void {
    this.addTrustedPublicKey(keyId, publicKey);
  }

  private getKeyFingerprint(key: Buffer): string {
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  saveKeyPair(keyPair: KeyPair, filePath: string): void {
    fs.writeFileSync(filePath, JSON.stringify(keyPair, null, 2));
    logger.info('save_keypair', '密钥对已保存', { keyId: keyPair.keyId, filePath });
  }

  loadKeyPair(filePath: string): KeyPair {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  }

  createFirmwareSignature(filePath: string): FirmwareSignature {
    const data = fs.readFileSync(filePath);
    const signature = this.sign(data);
    
    return {
      md5: this.calculateHash(data, 'md5'),
      sha256: this.calculateHash(data, 'sha256'),
      signature,
      encrypted: false
    };
  }

  verifyFirmwareSignature(filePath: string, sig: FirmwareSignature): boolean {
    const data = fs.readFileSync(filePath);
    
    if (sig.sha256) {
      const actualSha256 = this.calculateHash(data, 'sha256');
      if (actualSha256 !== sig.sha256) {
        logger.warn('hash_mismatch', 'SHA256哈希不匹配');
        return false;
      }
    }

    if (sig.signature) {
      return this.verify(data, sig.signature);
    }

    return true;
  }
}

export const createFirmwareCrypto = (): FirmwareCrypto => {
  return new FirmwareCrypto();
};

export default FirmwareCrypto;
