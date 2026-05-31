import { Request, Response } from 'express'
import gatewayAdapter from '../services/gatewayAdapter.js'
import cleanupService from '../services/cleanupService.js'
import { getConnectedClientCount, getQueueSize } from '../websocket.js'
import * as deviceRepo from '../repositories/deviceRepository.js'
import * as alertRepo from '../repositories/alertRepository.js'

export function getSystemStatus(req: Request, res: Response) {
  try {
    const gatewayStatus = gatewayAdapter.getStatus()
    const cleanupStatus = cleanupService.getStatus()
    const trendCount = deviceRepo.getTrendDataCount()
    const alertsCount = alertRepo.getAlertsCount()

    const data = {
      gateway: gatewayStatus,
      cleanup: cleanupStatus,
      websocket: {
        connectedClients: getConnectedClientCount(),
        messageQueueSize: getQueueSize(),
      },
      database: {
        trendRecords: trendCount,
        alerts: alertsCount,
      },
      timestamp: Date.now(),
    }

    res.json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function triggerCleanup(req: Request, res: Response) {
  try {
    cleanupService.doCleanup()
    res.json({ success: true, message: 'Cleanup triggered' })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}
