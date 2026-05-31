import * as Minio from 'minio';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MinioProvider {
  private readonly client: Minio.Client;
  private readonly logger = new Logger(MinioProvider.name);

  constructor() {
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT, 10) || 9000,
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      useSSL: false,
    });
  }

  async putObject(
    bucket: string,
    name: string,
    buffer: Buffer,
    size: number,
    metadata?: Record<string, string>,
  ): Promise<string> {
    await this.client.putObject(bucket, name, buffer, size, metadata);
    return name;
  }

  async getObject(bucket: string, name: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const dataStream = this.client.getObject(bucket, name);
      const chunks: Buffer[] = [];
      dataStream.on('data', (chunk) => chunks.push(chunk));
      dataStream.on('end', () => resolve(Buffer.concat(chunks)));
      dataStream.on('error', (err) => reject(err));
    });
  }

  async removeObject(bucket: string, name: string): Promise<void> {
    await this.client.removeObject(bucket, name);
  }

  async ensureBucket(bucket: string): Promise<void> {
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      await this.client.makeBucket(bucket);
      this.logger.log(`Created bucket: ${bucket}`);
    }
  }

  getClient(): Minio.Client {
    return this.client;
  }
}

export const MinioClientProvider = {
  provide: 'MINIO_CLIENT',
  useFactory: () => {
    const client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT, 10) || 9000,
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      useSSL: false,
    });
    return client;
  },
};
