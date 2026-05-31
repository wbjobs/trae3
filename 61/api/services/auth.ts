import db from '../database.js';
import type { Role, Permission, User } from '../../shared/types.js';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'sensor:read', 'sensor:write', 'panel:read', 'panel:write',
    'data:read', 'data:export', 'metadata:read', 'metadata:write', 'system:admin',
  ],
  engineer: [
    'sensor:read', 'sensor:write', 'panel:read', 'panel:write',
    'data:read', 'metadata:read',
  ],
  analyst: [
    'sensor:read', 'panel:read', 'data:read', 'data:export', 'metadata:read',
  ],
};

function rowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function authenticate(username: string, password: string): User | null {
  const row = db.prepare(
    'SELECT * FROM users WHERE username = ?'
  ).get(username) as any;
  if (!row) return null;

  const passwordHash = Buffer.from(password).toString('base64');
  if (row.password_hash !== passwordHash) return null;

  return rowToUser(row);
}

export function getUserById(id: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToUser(row);
}

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

export function getAllUsers(): User[] {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as any[];
  return rows.map(rowToUser);
}

export function createUser(username: string, password: string, role: Role): User {
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const passwordHash = Buffer.from(password).toString('base64');

  db.prepare(
    'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(id, username, passwordHash, role);

  return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

export function updateUser(id: string, updates: { username?: string; password?: string; role?: Role }): User | null {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!existing) return null;

  const username = updates.username ?? existing.username;
  const role = updates.role ?? existing.role;
  const passwordHash = updates.password
    ? Buffer.from(updates.password).toString('base64')
    : existing.password_hash;

  db.prepare(
    'UPDATE users SET username = ?, password_hash = ?, role = ? WHERE id = ?'
  ).run(username, passwordHash, role, id);

  return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

export function deleteUser(id: string): boolean {
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return result.changes > 0;
}
