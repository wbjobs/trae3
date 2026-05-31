import deviceService from '../services/deviceService.js'
import type { Request, Response } from 'express'

export function listDevices(req: Request, res: Response) {
  try {
    const { type, floor } = req.query
    const data = deviceService.listDevices(type as string, floor != null ? Number(floor) : undefined)
    res.json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function getDevice(req: Request, res: Response) {
  try {
    const { id } = req.params
    const data = deviceService.getDevice(id)
    if (!data) {
      res.status(404).json({ success: false, error: 'Device not found' })
      return
    }
    res.json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function getDeviceTrend(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { key, hours } = req.query
    const data = deviceService.getDeviceTrend(id, key as string, hours ? Number(hours) : 24)
    res.json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function getStats(req: Request, res: Response) {
  try {
    const data = deviceService.getStats()
    res.json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function getFloorStats(req: Request, res: Response) {
  try {
    const { floor } = req.params
    const data = deviceService.getFloorStats(floor)
    res.json({ success: true, data })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}
