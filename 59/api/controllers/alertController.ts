import alertService from '../services/alertService.js'
import type { Request, Response } from 'express'

export function listAlerts(req: Request, res: Response) {
  try {
    const { level, status, page, limit } = req.query
    const data = alertService.listAlerts({
      level: level as string,
      status: status as string,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
    res.json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function getAlert(req: Request, res: Response) {
  try {
    const { id } = req.params
    const data = alertService.getAlert(id)
    if (!data) {
      res.status(404).json({ success: false, error: 'Alert not found' })
      return
    }
    res.json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function confirmAlert(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { confirmedBy } = req.body
    alertService.confirmAlert(id, confirmedBy)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function resolveAlert(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { remark } = req.body
    alertService.resolveAlert(id, remark)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}
