import express from 'express'
import { deviceControlService } from '../services/DeviceControlService'
import { webSocketService } from '../services/WebSocketService'

interface DeviceControlCommand {
  deviceId: string
  action: 'turnOn' | 'turnOff' | 'setValue'
  value?: number
  operatorId: string
}

export class ControlController {
  controlDevice(req: express.Request, res: express.Response) {
    try {
      const command: DeviceControlCommand = {
        ...req.body,
        operatorId: req.body.operatorId || 'api-user',
      }

      const result = deviceControlService.executeCommand(command)

      if (result.success) {
        const device = deviceControlService.getDeviceById(command.deviceId)
        if (device) {
          webSocketService.broadcastDeviceUpdate(device)
        }
      }

      res.json(result)
    } catch (error) {
      console.error('设备控制错误:', error)
      res.status(400).json({ success: false, message: '控制命令执行失败' })
    }
  }

  getDevices(req: express.Request, res: express.Response) {
    const devices = deviceControlService.getDevices()
    res.json({ devices })
  }

  getDeviceById(req: express.Request, res: express.Response) {
    const { deviceId } = req.params
    const device = deviceControlService.getDeviceById(deviceId)

    if (!device) {
      return res.status(404).json({ error: '设备不存在' })
    }

    res.json({ device })
  }

  getLinkageRules(req: express.Request, res: express.Response) {
    const rules = deviceControlService.getLinkageRules()
    res.json({ rules })
  }

  batchControl(req: express.Request, res: express.Response) {
    try {
      const { commands } = req.body as { commands: DeviceControlCommand[] }

      if (!Array.isArray(commands)) {
        return res.status(400).json({ success: false, message: '命令格式错误' })
      }

      const results = commands.map(cmd => {
        const command: DeviceControlCommand = {
          ...cmd,
          operatorId: cmd.operatorId || 'api-user',
        }
        return deviceControlService.executeCommand(command)
      })

      const successCount = results.filter(r => r.success).length

      res.json({
        success: successCount === commands.length,
        total: commands.length,
        successCount,
        failedCount: commands.length - successCount,
        results,
      })
    } catch (error) {
      console.error('批量控制错误:', error)
      res.status(400).json({ success: false, message: '批量控制执行失败' })
    }
  }
}

export const controlController = new ControlController()
