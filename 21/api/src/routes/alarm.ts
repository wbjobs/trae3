import express from 'express'
import { alarmController } from '../controllers/AlarmController'

const router = express.Router()

router.get('/pending', alarmController.getPendingAlarms)
router.get('/logs', alarmController.getAlarmLogs)
router.get('/rules', alarmController.getAlarmRules)
router.get('/stats', alarmController.getAlarmStats)
router.post('/:alarmId/acknowledge', alarmController.acknowledgeAlarm)
router.post('/:alarmId/resolve', alarmController.resolveAlarm)

export default router
