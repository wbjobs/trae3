import { getBaseDb, saveBaseDb } from '../db/base-db.js';
import type { Database } from 'sql.js';
import type { User } from '../../shared/types.js';

export async function findByUsername(username: string): Promise<User | null> {
  const db = await getBaseDb();
  const result = db.exec('SELECT id, username, display_name, role, created_at FROM users WHERE username = ?', [username]);
  if (!result[0]?.values?.[0]) return null;
  const [id, uname, displayName, role, createdAt] = result[0].values[0] as [string, string, string, string, string];
  return { id, username: uname, displayName, role: role as User['role'], createdAt };
}

export async function findById(id: string): Promise<User | null> {
  const db = await getBaseDb();
  const result = db.exec('SELECT id, username, display_name, role, created_at FROM users WHERE id = ?', [id]);
  if (!result[0]?.values?.[0]) return null;
  const [uid, username, displayName, role, createdAt] = result[0].values[0] as [string, string, string, string, string];
  return { id: uid, username, displayName, role: role as User['role'], createdAt };
}

export async function findAll(): Promise<User[]> {
  const db = await getBaseDb();
  const result = db.exec('SELECT id, username, display_name, role, created_at FROM users');
  if (!result[0]?.values) return [];
  return result[0].values.map((row) => {
    const [id, username, displayName, role, createdAt] = row as [string, string, string, string, string];
    return { id, username, displayName, role: role as User['role'], createdAt };
  });
}
