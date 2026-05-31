import 'reflect-metadata';
import { DataSource } from 'typeorm';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

export const getDatabasePath = (): string => {
  let basePath: string;
  try {
    basePath = app.getPath('userData');
  } catch {
    basePath = process.cwd();
  }
  const dbDir = path.join(basePath, 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return path.join(dbDir, 'firmware-manager.db');
};

const getDbPath = getDatabasePath;

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: process.env.NODE_ENV === 'development' 
    ? path.join(process.cwd(), 'data', 'firmware-manager.db')
    : getDbPath(),
  synchronize: true,
  logging: process.env.NODE_ENV === 'development',
  entities: [
    path.join(__dirname, 'entities', '*.entity.{ts,js}')
  ],
  migrations: [],
  subscribers: []
});

export const initializeDatabase = async (): Promise<void> => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
};
