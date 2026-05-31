const express = require('express');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const inventoryModule = require('../modules/inventory');

const router = express.Router();

router.get('/stats', auth, requirePermission('inventory:view'), async (req, res) => {
  try {
    const stats = await inventoryModule.getInventoryStats();
    res.json({
      code: 200,
      message: '获取成功',
      data: {
        totalChemicals: stats.totalChemicals,
        totalStock: stats.totalStock,
        normalCount: stats.normalCount,
        warningCount: stats.warningCount,
        dangerCount: stats.dangerCount
      }
    });
  } catch (error) {
    console.error('获取库存统计失败:', error);
    res.status(500).json({ code: 500, message: '获取库存统计失败' });
  }
});

router.get('/low-stock', auth, requirePermission('inventory:view'), async (req, res) => {
  try {
    const { page = 1, pageSize = 10, warningLevel, keyword } = req.query;
    const result = await inventoryModule.getLowStockChemicals({
      page,
      pageSize,
      warningLevel,
      keyword
    });
    res.json({
      code: 200,
      message: '获取成功',
      data: result
    });
  } catch (error) {
    console.error('获取低库存列表失败:', error);
    res.status(500).json({ code: 500, message: '获取低库存列表失败' });
  }
});

router.get('/alerts', auth, requirePermission('inventory:view'), async (req, res) => {
  try {
    const alerts = await inventoryModule.getStockAlertList();
    res.json({
      code: 200,
      message: '获取成功',
      data: alerts
    });
  } catch (error) {
    console.error('获取库存预警列表失败:', error);
    res.status(500).json({ code: 500, message: '获取库存预警列表失败' });
  }
});

router.put('/:id/threshold', auth, requirePermission('inventory:edit'), async (req, res) => {
  try {
    const { warningThreshold, dangerThreshold } = req.body;
    const chemical = await inventoryModule.setWarningThreshold(
      req.params.id,
      { warningThreshold, dangerThreshold }
    );
    res.json({
      code: 200,
      message: '阈值设置成功',
      data: chemical
    });
  } catch (error) {
    console.error('设置预警阈值失败:', error);
    res.status(400).json({ code: 400, message: error.message });
  }
});

router.get('/:id/usage-stats', auth, requirePermission('inventory:view'), async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const stats = await inventoryModule.getMonthlyUsageStats(
      req.params.id,
      Number(months)
    );
    res.json({
      code: 200,
      message: '获取成功',
      data: stats
    });
  } catch (error) {
    console.error('获取使用统计失败:', error);
    res.status(500).json({ code: 500, message: '获取使用统计失败' });
  }
});

module.exports = router;
