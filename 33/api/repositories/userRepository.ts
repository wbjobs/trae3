import db from '../db/main.js'

export interface User {
  id: number
  username: string
  password: string
  role: string
  lab_id: number | null
  created_at: string
  updated_at: string
}

export interface UserWithoutPassword {
  id: number
  username: string
  role: string
  lab_id: number | null
  created_at: string
  updated_at: string
}

export function findByUsername(username: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined
}

export function findById(id: number): UserWithoutPassword | undefined {
  return db.prepare('SELECT id, username, role, lab_id, created_at, updated_at FROM users WHERE id = ?').get(id) as UserWithoutPassword | undefined
}

export function findAll(): UserWithoutPassword[] {
  return db.prepare('SELECT id, username, role, lab_id, created_at, updated_at FROM users ORDER BY id').all() as UserWithoutPassword[]
}

export function create(data: { username: string; password: string; role: string; lab_id?: number | null }): void {
  db.prepare('INSERT INTO users (username, password, role, lab_id) VALUES (?, ?, ?, ?)').run(
    data.username,
    data.password,
    data.role,
    data.lab_id ?? null
  )
}

export function updateRole(id: number, role: string): void {
  db.prepare('UPDATE users SET role = ?, updated_at = datetime(\'now\') WHERE id = ?').run(role, id)
}
