import { Router } from 'express';
import {
  receiveMeterData,
  receiveBatchMeterData,
  getDashboardOverview,
  getHistoricalData,
  getHourlyConsumption,
  getConsumptionStats,
  getTrendReplay
} from '../controllers/dataController.js';

const router = Router();

router.post('/receive', receiveMeterData);
router.post('/receive-batch', receiveBatchMeterData);
router.get('/overview', getDashboardOverview);
router.get('/history', getHistoricalData);
router.get('/hourly-consumption', getHourlyConsumption);
router.get('/consumption-stats', getConsumptionStats);
router.get('/trend-replay', getTrendReplay);

export default router;
