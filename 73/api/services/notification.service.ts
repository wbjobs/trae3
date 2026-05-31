import { getBaseDb, saveBaseDb } from '../db/base-db.js';
import type { SampleItem } from '../../shared/types.js';

const TYPE_MAP: Record<string, string> = {
  chem: '化学试剂',
  bio: '生物样品',
  env: '环境样品',
  food: '食品样品',
  drug: '药品样品',
  other: '其他',
};

const STATUS_MAP: Record<string, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已退回',
};

export function generateCSV(samples: SampleItem[]): string {
  const header = ['样品编号', '样品名称', '类型', '当前步骤', '状态', '处理人', '登记时间', '更新时间'];
  const rows = samples.map(s => [
    s.sampleNo,
    s.name,
    s.type,
    s.currentStep,
    STATUS_MAP[s.status] || s.status,
    s.handler || '-',
    s.createdAt ? s.createdAt.slice(0, 19).replace('T', ' ') : '-',
    s.updatedAt ? s.updatedAt.slice(0, 19).replace('T', ' ') : '-',
  ]);

  const escape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const bom = '\uFEFF';
  return bom + [header, ...rows].map(r => r.map(escape).join(',')).join('\n');
}

export async function getPendingReminderSamples(): Promise<{ sampleNo: string; name: string; type: string; pendingHours: number; createdAt: string }[]> {
  const db = await getBaseDb();
  const result = db.exec(`
    SELECT s.sample_no, s.name, st.name as type_name, s.created_at
    FROM samples s
    LEFT JOIN sample_types st ON s.type_code = st.code
    WHERE s.status = 'pending'
    ORDER BY s.created_at ASC
  `);

  if (!result[0]?.values) return [];

  const now = Date.now();
  return result[0].values.map((row) => {
    const [sampleNo, name, typeName, createdAt] = row as [string, string, string, string];
    const pendingHours = Math.round((now - new Date(createdAt).getTime()) / (1000 * 60 * 60));
    return { sampleNo, name, type: typeName, pendingHours, createdAt };
  });
}

export async function createNotification(userId: string, type: 'approval' | 'reminder' | 'system', title: string, content: string, relatedSampleId?: string): Promise<void> {
  const db = await getBaseDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.run(
    'INSERT INTO notifications (id, user_id, type, title, content, related_sample_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
    [id, userId, type, title, content, relatedSampleId || null, now]
  );
  saveBaseDb();
}

export async function getNotifications(userId: string, includeRead: boolean = false): Promise<any[]> {
  const db = await getBaseDb();
  const where = includeRead ? 'user_id = ?' : 'user_id = ? AND is_read = 0';
  const result = db.exec(
    `SELECT n.id, n.type, n.title, n.content, n.related_sample_id, n.is_read, n.created_at, s.sample_no
     FROM notifications n
     LEFT JOIN samples s ON n.related_sample_id = s.id
     WHERE ${where}
     ORDER BY n.created_at DESC
     LIMIT 20`,
    [userId]
  );
  if (!result[0]?.values) return [];
  return result[0].values.map((row) => {
    const [id, type, title, content, relatedSampleId, isRead, createdAt, sampleNo] = row as [string, string, string, string, string | null, number, string, string | null];
    return { id, type, title, content, relatedSampleId, isRead: isRead === 1, createdAt, sampleNo };
  });
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const db = await getBaseDb();
  db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [notificationId]);
  saveBaseDb();
}

export async function getUnreadCount(userId: string): Promise<number> {
  const db = await getBaseDb();
  const result = db.exec('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
  return (result[0]?.values[0]?.[0] as number) || 0;
}

export async function sendPendingApprovalReminders(): Promise<number> {
  const pending = await getPendingReminderSamples();
  const urgent = pending.filter(s => s.pendingHours >= 24);

  for (const sample of urgent) {
    await createNotification(
      'u003',
      'reminder',
      `送检提醒：样品 ${sample.sampleNo} 等待审批已超 24 小时`,
      `样品"${sample.name}"(${sample.type})已待审批 ${sample.pendingHours} 小时，请尽快处理。`,
      undefined
    );
  }

  return urgent.length;
}
