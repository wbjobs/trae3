import express from 'express'
import { sensorDataService } from '../services/SensorDataService'
import { alarmService } from '../services/AlarmService'
import { deviceControlService } from '../services/DeviceControlService'
import { webSocketService } from '../services/WebSocketService'
import config from '../../config'

export class DataController {
  getCabins(req: express.Request, res: express.Response) {
    const cabins = sensorDataService.getCabins()
    res.json({ cabins })
  }

  getCabinById(req: express.Request, res: express.Response) {
    const { cabinId } = req.params
    const cabin = sensorDataService.getCabinById(cabinId)
    
    if (!cabin) {
      return res.status(404).json({ error: '舱室不存在' })
    }

    res.json({ cabin })
  }

  getSensors(req: express.Request, res: express.Response) {
    const sensors = sensorDataService.getSensors()
    res.json({ sensors })
  }

  getSensorsByCabin(req: express.Request, res: express.Response) {
    const { cabinId } = req.params
    const sensors = sensorDataService.getSensorsByCabin(cabinId)
    res.json({ sensors })
  }

  getRealtimeData(req: express.Request, res: express.Response) {
    const { cabinId } = req.params
    
    if (cabinId) {
      const data = sensorDataService.getCabinLatestData(cabinId)
      res.json({ cabinId, data })
    } else {
      const data = sensorDataService.getAllLatestData()
      res.json({ data })
    }
  }

  async getHistoryData(req: express.Request, res: express.Response) {
    try {
      const { sensorId } = req.params
      const { startTime, endTime, interval } = req.query

      const start = startTime ? new Date(startTime as string) : new Date(Date.now() - 3600000)
      const end = endTime ? new Date(endTime as string) : new Date()
      const intervalStr = (interval as string) || '1m'

      const data = await sensorDataService.getHistoryData(sensorId, start, end, intervalStr)
      res.json({ sensorId, data })
    } catch (error) {
      console.error('获取历史数据错误:', error)
      res.status(500).json({ error: '获取历史数据失败' })
    }
  }

  getDevices(req: express.Request, res: express.Response) {
    const devices = deviceControlService.getDevices()
    res.json({ devices })
  }

  getDevicesByCabin(req: express.Request, res: express.Response) {
    const { cabinId } = req.params
    const devices = deviceControlService.getDevicesByCabin(cabinId)
    res.json({ devices })
  }

  getSystemStats(req: express.Request, res: express.Response) {
    const stats = {
      environment: config.env,
      totalSensors: sensorDataService.getSensors().length,
      activeSensors: sensorDataService.getAllLatestData().length,
      totalDevices: deviceControlService.getDevices().length,
      activeDevices: deviceControlService.getDevices().filter((d: any) => d.status === 'on').length,
      activeAlarms: alarmService.getActiveAlarmCount(),
      todayAlarms: alarmService.getTodayAlarmCount(),
      dataPointsToday: sensorDataService.getDataPointCount(),
      connectedClients: webSocketService.getClientCount(),
    }

    res.json({ stats })
  }

  getAlarmLogs(req: express.Request, res: express.Response) {
    const limit = parseInt(req.query.limit as string) || 100
    const offset = parseInt(req.query.offset as string) || 0

    const logs = alarmService.getAlarmLogs(limit, offset)
    res.json({ logs, total: logs.length })
  }

  getControlLogs(req: express.Request, res: express.Response) {
    const limit = parseInt(req.query.limit as string) || 50
    const offset = parseInt(req.query.offset as string) || 0

    const logs = deviceControlService.getControlLogs(limit, offset)
    res.json({ logs, total: logs.length })
  }

  getLinkageRules(req: express.Request, res: express.Response) {
    const rules = deviceControlService.getLinkageRules()
    res.json({ rules })
  }
}

export const dataController = new DataController()
