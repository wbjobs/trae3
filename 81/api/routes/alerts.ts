import { Router } from 'express';
import {
  getAlerts,
  handleAlert,
  getAlertStatistics
} from '../controllers/alertController.js';

const router = Router();

router.get('/', getAlerts);
router.get('/statistics', getAlertStatistics);
router.put('/:id/handle', handleAlert);

export default router;
