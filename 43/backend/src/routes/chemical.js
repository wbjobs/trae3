const express = require('express');
const { Op } = require('../config/database');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const { Chemical } = require('../models/base');

const router = express.Router();

router.get('/', auth, requirePermission('apply:view'), async (req, res) => {
  try {
    const { page = 1, pageSize = 10, keyword, dangerLevel } = req.query;

    const where = {};

    if (keyword) {
      where[Op.or] = [
        { chemicalName: { [Op.like]: `%${keyword}%` } },
        { casNo: { [Op.like]: `%${keyword}%` } },
        { specification: { [Op.like]: `%${keyword}%` } }
      ];
    }

    if (dangerLevel) {
      where.dangerLevel = dangerLevel;
    }

    const { count, rows } = await Chemical.findAndCountAll({
      where,
      order: [['id', 'ASC']],
      limit: Number(pageSize),
      offset: (Number(page) - 1) * Number(pageSize)
    });

    res.json({
      code: 200,
      message: '获取成功',
      data: {
        list: rows,
        total: count,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(count / pageSize),
        dangerLevels: Chemical.DANGER_LEVELS
      }
    });
  } catch (error) {
    console.error('获取危化品列表失败:', error);
    res.status(500).json({ code: 500, message: '获取危化品列表失败，请稍后重试' });
  }
});

router.get('/:id', auth, requirePermission('apply:view'), async (req, res) => {
  try {
    const chemical = await Chemical.findByPk(req.params.id);

    if (!chemical) {
      return res.status(404).json({ code: 404, message: '危化品不存在' });
    }

    res.json({
      code: 200,
      message: '获取成功',
      data: chemical
    });
  } catch (error) {
    console.error('获取危化品详情失败:', error);
    res.status(500).json({ code: 500, message: '获取危化品详情失败，请稍后重试' });
  }
});

module.exports = router;
