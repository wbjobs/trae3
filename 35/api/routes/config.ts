import { Router } from 'express';
import { ConfigLoader } from '../utils/ConfigLoader.js';

const router = Router();

router.get('/entities', (_req, res) => {
  res.json({
    success: true,
    data: ConfigLoader.getAllEntityConfigs()
  });
});

router.get('/skills', (_req, res) => {
  res.json({
    success: true,
    data: ConfigLoader.getAllSkillConfigs()
  });
});

router.get('/maps', (_req, res) => {
  res.json({
    success: true,
    data: ConfigLoader.getAllMapConfigs()
  });
});

router.get('/entities/:id', (req, res) => {
  const { id } = req.params;
  const config = ConfigLoader.getEntityConfig(id);

  if (!config) {
    return res.status(404).json({
      success: false,
      error: '实体配置不存在'
    });
  }

  res.json({
    success: true,
    data: config
  });
});

export default router;
