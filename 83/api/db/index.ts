import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const METADATA_DB_PATH = path.join(__dirname, '../../data/metadata.db');
const ATTACHMENT_DB_PATH = path.join(__dirname, '../../data/attachment.db');

let metadataDb: Database.Database | null = null;
let attachmentDb: Database.Database | null = null;

export function getMetadataDb(): Database.Database {
  if (!metadataDb) {
    metadataDb = new Database(METADATA_DB_PATH);
    metadataDb.pragma('journal_mode = WAL');
    metadataDb.pragma('foreign_keys = ON');
  }
  return metadataDb;
}

export function getAttachmentDb(): Database.Database {
  if (!attachmentDb) {
    attachmentDb = new Database(ATTACHMENT_DB_PATH);
    attachmentDb.pragma('journal_mode = WAL');
    attachmentDb.pragma('foreign_keys = ON');
  }
  return attachmentDb;
}

export function closeDatabases(): void {
  if (metadataDb) {
    metadataDb.close();
    metadataDb = null;
  }
  if (attachmentDb) {
    attachmentDb.close();
    attachmentDb = null;
  }
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
