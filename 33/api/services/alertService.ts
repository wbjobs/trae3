import db from '../db/main.js'
import * as messageRepo from '../repositories/messageRepository.js'
import * as userRepo from '../repositories/userRepository.js'

const APPROVAL_TIMEOUT_HOURS = 24
const TRANSIT_TIMEOUT_HOURS = 48
const LAB_CAPACITY_THRESHOLD = 0.9

export function checkTimeoutAlerts(): void {
  checkApprovalTimeout()
  checkTransitTimeout()
  checkLabCapacity()
  checkStatusAnomaly()
}

function checkApprovalTimeout(): void {
  const pending = db.prepare(`
    SELECT t.id, t.sample_id, t.applied_at, t.to_lab_id,
      s.name as sample_name,
      CAST((julianday('now') - julianday(t.applied_at)) * 24 AS REAL) as hours_pending
    FROM transfers t
    LEFT JOIN samples s ON t.sample_id = s.id
    WHERE t.status = 'pending'
    AND CAST((julianday('now') - julianday(t.applied_at)) * 24 AS REAL) > ?
  `).all(APPROVAL_TIMEOUT_HOURS) as any[]

  for (const t of pending) {
    const existing = db.prepare(
      "SELECT id FROM messages WHERE type = 'transfer_timeout' AND related_id = ? AND created_at > datetime('now', '-1 hour')"
    ).get(t.id)

    if (!existing) {
      const approvers = userRepo.findAll().filter(u => u.role === 'approver' && u.lab_id === t.to_lab_id)
      for (const approver of approvers) {
        messageRepo.create({
          type: 'transfer_timeout',
          title: '审批超时预警',
          content: `样本"${t.sample_name}"的流转申请已等待${Math.round(t.hours_pending)}小时，超过${APPROVAL_TIMEOUT_HOURS}小时阈值，请尽快处理。`,
          user_id: approver.id,
          related_id: t.id,
        })
      }
      const admins = userRepo.findAll().filter(u => u.role === 'admin')
      for (const admin of admins) {
        messageRepo.create({
          type: 'transfer_timeout',
          title: '审批超时预警',
          content: `样本"${t.sample_name}"的流转申请已等待${Math.round(t.hours_pending)}小时，超过审批时限。`,
          user_id: admin.id,
          related_id: t.id,
        })
      }
    }
  }
}

function checkTransitTimeout(): void {
  const inTransit = db.prepare(`
    SELECT t.id, t.sample_id, t.approved_at, t.applied_by,
      s.name as sample_name,
      CAST((julianday('now') - julianday(t.approved_at)) * 24 AS REAL) as hours_in_transit
    FROM transfers t
    LEFT JOIN samples s ON t.sample_id = s.id
    WHERE t.status = 'in_transit'
    AND t.approved_at IS NOT NULL
    AND CAST((julianday('now') - julianday(t.approved_at)) * 24 AS REAL) > ?
  `).all(TRANSIT_TIMEOUT_HOURS) as any[]

  for (const t of inTransit) {
    const existing = db.prepare(
      "SELECT id FROM messages WHERE type = 'transfer_timeout' AND related_id = ? AND created_at > datetime('now', '-6 hours')"
    ).get(t.id)

    if (!existing) {
      messageRepo.create({
        type: 'transfer_timeout',
        title: '流转超时预警',
        content: `样本"${t.sample_name}"已流转${Math.round(t.hours_in_transit)}小时，超过${TRANSIT_TIMEOUT_HOURS}小时阈值，请确认签收状态。`,
        user_id: t.applied_by,
        related_id: t.id,
      })
    }
  }
}

function checkLabCapacity(): void {
  const labs = db.prepare(`
    SELECT l.id, l.name, l.capacity,
      COALESCE(s.sample_count, 0) as current_count,
      CAST(COALESCE(s.sample_count, 0) AS REAL) / l.capacity as utilization
    FROM labs l
    LEFT JOIN (SELECT lab_id, COUNT(*) as sample_count FROM samples WHERE status IN ('in_stock', 'in_transit', 'received') GROUP BY lab_id) s ON l.id = s.lab_id
    WHERE CAST(COALESCE(s.sample_count, 0) AS REAL) / l.capacity > ?
  `).all(LAB_CAPACITY_THRESHOLD) as any[]

  for (const lab of labs) {
    const existing = db.prepare(
      "SELECT id FROM messages WHERE type = 'lab_capacity' AND content LIKE ? AND created_at > datetime('now', '-24 hours')"
    ).get(`%${lab.name}%`)

    if (!existing) {
      const admins = userRepo.findAll().filter(u => u.role === 'admin')
      const approvers = userRepo.findAll().filter(u => u.role === 'approver' && u.lab_id === lab.id)

      for (const user of [...admins, ...approvers]) {
        messageRepo.create({
          type: 'lab_capacity',
          title: '实验室容量预警',
          content: `"${lab.name}"当前存储${lab.current_count}份样本，容量利用率达${Math.round(lab.utilization * 100)}%，已超过${LAB_CAPACITY_THRESHOLD * 100}%预警阈值。`,
          user_id: user.id,
          related_id: lab.id,
        })
      }
    }
  }
}

function checkStatusAnomaly(): void {
  const anomalies = db.prepare(`
    SELECT s.id, s.sample_code, s.name, s.status,
      COUNT(t.id) as active_transfer_count
    FROM samples s
    LEFT JOIN transfers t ON s.id = t.sample_id AND t.status IN ('pending', 'in_transit')
    WHERE s.status = 'in_stock' AND t.id IS NOT NULL
    GROUP BY s.id
  `).all() as any[]

  for (const a of anomalies) {
    const existing = db.prepare(
      "SELECT id FROM messages WHERE type = 'status_anomaly' AND related_id = ? AND created_at > datetime('now', '-6 hours')"
    ).get(a.id)

    if (!existing) {
      const admins = userRepo.findAll().filter(u => u.role === 'admin')
      for (const admin of admins) {
        messageRepo.create({
          type: 'status_anomaly',
          title: '样本状态异常',
          content: `样本"${a.name}"(${a.sample_code})状态为"在库"，但存在活跃的流转申请，状态可能不一致，请核查。`,
          user_id: admin.id,
          related_id: a.id,
        })
      }
    }
  }
}
