import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

export interface ServerConfig {
  port: number;
  host: string;
  apiKey: string;
  storagePath: string;
  databasePath: string;
  maxFileSize: number;
  allowedExtensions: string[];
  logLevel: string;
}

function parseAllowedExtensions(extensions: string): string[] {
  return extensions.split(',').map(ext => ext.trim().toLowerCase());
}

export const config: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  apiKey: process.env.API_KEY || '',
  storagePath: path.resolve(process.env.STORAGE_PATH || './storage'),
  databasePath: path.resolve(process.env.DATABASE_PATH || './data/firmware.db'),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600', 10),
  allowedExtensions: parseAllowedExtensions(process.env.ALLOWED_EXTENSIONS || '.bin,.hex,.elf,.axf,.out'),
  logLevel: process.env.LOG_LEVEL || 'info'
};

export function validateConfig(): string[] {
  const errors: string[] = [];
  
  if (config.port < 1 || config.port > 65535) {
    errors.push('端口号必须在 1-65535 之间');
  }
  
  if (config.maxFileSize < 0) {
    errors.push('最大文件大小不能为负数');
  }
  
  return errors;
}
