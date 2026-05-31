import * as transferRepo from '../repositories/transferRepository.js'
import * as sampleRepo from '../repositories/sampleRepository.js'
import * as messageService from './messageService.js'
import * as alertService from './alertService.js'
import { eventBus } from './eventBus.js'
import { taskQueue } from './taskQueue.js'
import db from '../db/main.js'

eventBus.onEvent('transfer:created', (data) => {
  taskQueue.enqueue(() => {
    const transfer = transferRepo.findById(data.transferId)
    if (transfer) messageService.sendApprovalNotification(transfer)
  })
})

eventBus.onEvent('transfer:approved', (data) => {
  taskQueue.enqueue(() => {
    const transfer = transferRepo.findById(data.transferId)
    if (transfer) {
      messageService.sendApprovalResult(transfer, data.approved)
      if (data.approved) {
        alertService.checkTimeoutAlerts()
      }
    }
  })
})

eventBus.onEvent('transfer:received', (data) => {
  taskQueue.enqueue(() => {
    const transfer = transferRepo.findById(data.transferId)
    if (transfer) {
      messageService.sendReceiveNotification(transfer)
      taskQueue.enqueue(() => {
        try {
          transferRepo.archive(transfer)
        } catch (err) {
          console.error('Archive failed:', err)
        }
      })
      alertService.checkTimeoutAlerts()
    }
  })
})

export function createTransfer(data: {
  sample_id: number
  to_lab_id: number
  reason?: string
  applied_by: number
}) {
  const sample = sampleRepo.findById(data.sample_id)
  if (!sample) throw new Error('样本不存在')
  if (sample.status !== 'in_stock' && sample.status !== 'received') throw new Error('当前样本状态不可发起流转')

  const transfer = transferRepo.create({
    sample_id: data.sample_id,
    from_lab_id: sample.lab_id,
    to_lab_id: data.to_lab_id,
    reason: data.reason,
    applied_by: data.applied_by,
  })

  eventBus.emitEvent('transfer:created', {
    transferId: transfer.id,
    toLabId: data.to_lab_id,
    sampleId: data.sample_id,
  })

  return transferRepo.findById(transfer.id)
}

export function approveTransfer(transferId: number, approvedBy: number, approved: boolean, comment?: string) {
  const transfer = transferRepo.findById(transferId)
  if (!transfer) throw new Error('流转记录不存在')
  if (transfer.status !== 'pending') throw new Error('当前状态不可审批')

  const tx = db.transaction(() => {
    if (approved) {
      transferRepo.updateStatus(transferId, 'in_transit', approvedBy)
      sampleRepo.updateStatus(transfer.sample_id, 'in_transit')
    } else {
      transferRepo.updateStatus(transferId, 'rejected', approvedBy, comment)
      sampleRepo.updateStatus(transfer.sample_id, 'in_stock')
    }
  })
  tx()

  eventBus.emitEvent('transfer:approved', {
    transferId,
    approved,
    appliedBy: transfer.applied_by,
  })

  return transferRepo.findById(transferId)
}

export function receiveTransfer(transferId: number, receivedBy: number) {
  const transfer = transferRepo.findById(transferId)
  if (!transfer) throw new Error('流转记录不存在')
  if (transfer.status !== 'in_transit') throw new Error('当前状态不可签收')

  const tx = db.transaction(() => {
    transferRepo.receive(transferId, receivedBy)
    sampleRepo.updateLab(transfer.sample_id, transfer.to_lab_id)
    sampleRepo.updateStatus(transfer.sample_id, 'received')
  })
  tx()

  eventBus.emitEvent('transfer:received', {
    transferId,
    receivedBy,
  })

  return transferRepo.findById(transferId)
}

export function listTransfers(query: transferRepo.TransferQuery) {
  return transferRepo.findAll(query)
}

export function getPendingApprovals(labId: number) {
  return transferRepo.findPendingByLabId(labId)
}
