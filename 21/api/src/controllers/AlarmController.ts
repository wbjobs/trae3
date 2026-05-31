import express from 'express'
import { alarmService } from '../services/AlarmService'

export class AlarmController {
  getPendingAlarms(req: express.Request, res: express.Response) {
    const alarms = alarmService.getPendingAlarms()
    res.json({ alarms, count: alarms.length })
  }

  getAlarmLogs(req: express.Request, res: express.Response) {
    const limit = parseInt(req.query.limit as string) || 100
    const offset = parseInt(req.query.offset as string) || 0

    const logs = alarmService.getAlarmLogs(limit, offset)
    res.json({ logs, total: logs.length })
  }

  acknowledgeAlarm(req: express.Request, res: express.Response) {
    try {
      const { alarmId } = req.params
      const { handlerId } = req.body

      const success = alarmService.acknowledgeAlarm(alarmId, handlerId || 'api-user')

      if (success) {
        res.json({ success: true, message: '告警已确认' })
      } else {
        res.status(404).json({ success: false, message: '告警不存在' })
      }
    } catch (error) {
      console.error('确认告警错误:', error)
      res.status(500).json({ success: false, message: '确认告警失败' })
    }
  }

  resolveAlarm(req: express.Request, res: express.Response) {
    try {
      const { alarmId } = req.params
      const { handlerId } = req.body

      const success = alarmService.resolveAlarm(alarmId, handlerId || 'api-user')

      if (success) {
        res.json({ success: true, message: '告警已解决' })
      } else {
        res.status(404).json({ success: false, message: '告警不存在' })
      }
    } catch (error) {
      console.error('解决告警错误:', error)
      res.status(500).json({ success: false, message: '解决告警失败' })
    }
  }

  getAlarmRules(req: express.Request, res: express.Response) {
    const rules = alarmService.getAlarmRules()
    res.json({ rules })
  }

  getAlarmStats(req: express.Request, res: express.Response) {
    const stats = {
      active: alarmService.getActiveAlarmCount(),
      today: alarmService.getTodayAlarmCount(),
      pending: alarmService.getPendingAlarms().filter(a => a.status === 'pending').length,
      acknowledged: alarmService.getPendingAlarms().filter(a => a.status === 'acknowledged').length,
    }

    res.json({ stats })
  }
}

export const alarmController = new AlarmController()
