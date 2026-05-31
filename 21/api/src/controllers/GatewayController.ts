import express from 'express'
import { sensorDataService } from '../services/SensorDataService'
import { webSocketService } from '../services/WebSocketService'

type SensorType = 'temperature' | 'humidity' | 'level' | 'pressure'

interface SensorData {
  cabinId: string
  sensorId: string
  sensorType: SensorType
  value: number
  unit: string
  timestamp: Date
}

export class GatewayController {
  async receiveSensorData(req: express.Request, res: express.Response) {
    try {
      const data: SensorData = {
        ...req.body,
        timestamp: new Date(req.body.timestamp || Date.now()),
      }

      const success = await sensorDataService.receiveData(data)

      if (success) {
        webSocketService.broadcastSensorData(data)
        res.json({ success: true, message: '数据接收成功' })
      } else {
        res.status(500).json({ success: false, message: '数据处理失败' })
      }
    } catch (error) {
      console.error('接收传感器数据错误:', error)
      res.status(400).json({ success: false, message: '请求参数错误' })
    }
  }

  async receiveBatchData(req: express.Request, res: express.Response) {
    try {
      const { data } = req.body as { data: any[] }

      if (!Array.isArray(data)) {
        return res.status(400).json({ success: false, message: '数据格式错误' })
      }

      const sensorDataArray: SensorData[] = data.map(d => ({
        ...d,
        timestamp: new Date(d.timestamp || Date.now()),
      }))

      const result = await sensorDataService.receiveBatchData(sensorDataArray)

      if (result.success) {
        webSocketService.broadcastBatchSensorData(sensorDataArray)
      }

      res.json(result)
    } catch (error) {
      console.error('批量接收传感器数据错误:', error)
      res.status(400).json({ success: false, message: '请求参数错误' })
    }
  }
}

export const gatewayController = new GatewayController()
