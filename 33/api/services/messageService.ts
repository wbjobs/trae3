import * as messageRepo from '../repositories/messageRepository.js'
import * as userRepo from '../repositories/userRepository.js'
import * as sampleRepo from '../repositories/sampleRepository.js'
import type { TransferWithDetails } from '../repositories/transferRepository.js'

export function sendApprovalNotification(transfer: { id: number; to_lab_id: number; sample_id: number }) {
  const approvers = userRepo.findAll().filter(u => u.role === 'approver' && u.lab_id === transfer.to_lab_id)
  const sample = sampleRepo.findById(transfer.sample_id)
  for (const approver of approvers) {
    messageRepo.create({
      type: 'approval_pending',
      title: '新的流转审批申请',
      content: `样本"${sample?.name || ''}"申请流转至您的实验室，请及时审批。`,
      user_id: approver.id,
      related_id: transfer.id,
    })
  }
}

export function sendApprovalResult(transfer: TransferWithDetails, approved: boolean) {
  messageRepo.create({
    type: 'approval_result',
    title: approved ? '流转申请已通过' : '流转申请已驳回',
    content: approved
      ? `样本"${transfer.sample_name}"的流转申请已通过审批。`
      : `样本"${transfer.sample_name}"的流转申请已被驳回。${transfer.reject_reason ? '原因：' + transfer.reject_reason : ''}`,
    user_id: transfer.applied_by,
    related_id: transfer.id,
  })
}

export function sendReceiveNotification(transfer: TransferWithDetails) {
  messageRepo.create({
    type: 'transfer_received',
    title: '样本已签收',
    content: `样本"${transfer.sample_name}"已由目标实验室签收。`,
    user_id: transfer.applied_by,
    related_id: transfer.id,
  })
}

export function getUserMessages(userId: number) {
  return messageRepo.findByUserId(userId)
}

export function markAsRead(id: number) {
  messageRepo.markAsRead(id)
}

export function markAllAsRead(userId: number) {
  messageRepo.markAllAsRead(userId)
}

export function getUnreadCount(userId: number) {
  return messageRepo.countUnread(userId)
}
