import { DataSource } from 'typeorm';
import { config } from '../config';
import * as path from 'path';
import * as fs from 'fs';
import { FirmwareArchive } from '../entities/FirmwareArchive';
import { LogEntry, BuildLog } from '../entities/LogEntry';

let dataSource: DataSource | null = null;

export async function initDatabase(): Promise<DataSource> {
  const dbDir = path.dirname(config.databasePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dataSource = new DataSource({
    type: 'sqlite',
    database: config.databasePath,
    entities: [FirmwareArchive, LogEntry, BuildLog],
    synchronize: true,
    logging: config.logLevel === 'debug'
  });

  await dataSource.initialize();
  return dataSource;
}

export function getDataSource(): DataSource {
  if (!dataSource) {
    throw new Error('Database not initialized');
  }
  return dataSource;
}

export async function closeDatabase(): Promise<void> {
  if (dataSource) {
    await dataSource.destroy();
    dataSource = null;
  }
}
