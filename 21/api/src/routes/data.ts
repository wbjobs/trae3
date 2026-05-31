import express from 'express'
import { dataController } from '../controllers/DataController'

const router = express.Router()

router.get('/cabins', dataController.getCabins)
router.get('/cabins/:cabinId', dataController.getCabinById)
router.get('/sensors', dataController.getSensors)
router.get('/sensors/cabin/:cabinId', dataController.getSensorsByCabin)
router.get('/realtime', dataController.getRealtimeData)
router.get('/realtime/:cabinId', dataController.getRealtimeData)
router.get('/history/:sensorId', dataController.getHistoryData)
router.get('/devices', dataController.getDevices)
router.get('/devices/cabin/:cabinId', dataController.getDevicesByCabin)
router.get('/stats', dataController.getSystemStats)
router.get('/alarm-logs', dataController.getAlarmLogs)
router.get('/control-logs', dataController.getControlLogs)
router.get('/linkage-rules', dataController.getLinkageRules)

export default router
