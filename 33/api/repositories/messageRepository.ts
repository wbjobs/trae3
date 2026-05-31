import db from '../db/main.js'

export interface Message {
  id: number
  type: string
  title: string
  content: string
  read: number
  user_id: number
  related_id: number | null
  created_at: string
}

export function create(data: {
  type: string
  title: string
  content?: string
  user_id: number
  related_id?: number | null
}): void {
  db.prepare(`
    INSERT INTO messages (type, title, content, user_id, related_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.type, data.title, data.content || '', data.user_id, data.related_id ?? null)
}

export function findByUserId(userId: number): Message[] {
  return db.prepare('SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Message[]
}

export function markAsRead(id: number): void {
  db.prepare('UPDATE messages SET read = 1 WHERE id = ?').run(id)
}

export function markAllAsRead(userId: number): void {
  db.prepare('UPDATE messages SET read = 1 WHERE user_id = ? AND read = 0').run(userId)
}

export function countUnread(userId: number): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND read = 0').get(userId) as { count: number }
  return row.count
}
