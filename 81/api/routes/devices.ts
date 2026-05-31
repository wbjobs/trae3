import { Router } from 'express';
import {
  getDevices,
  getDeviceDetail,
  createDevice,
  updateDevice,
  deleteDevice,
  getAreas,
  initializeMockData
} from '../controllers/deviceController.js';

const router = Router();

router.get('/', getDevices);
router.get('/areas', getAreas);
router.get('/:id', getDeviceDetail);
router.post('/', createDevice);
router.put('/:id', updateDevice);
router.delete('/:id', deleteDevice);
router.post('/init-mock', initializeMockData);

export default router;
