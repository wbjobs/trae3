import { Router } from 'express';
import dashboardRouter from './dashboardRoutes.js';
import taskRouter from './taskRoutes.js';
import nodeRouter from './nodeRoutes.js';
import resultRouter from './resultRoutes.js';

const router = Router();

router.use('/dashboard', dashboardRouter);
router.use('/tasks', taskRouter);
router.use('/nodes', nodeRouter);
router.use('/results', resultRouter);

export default router;
