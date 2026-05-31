const express = require('express');
const { Op } = require('../config/database');
const XLSX = require('xlsx');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const { Application } = require('../models/flow');
const { Chemical } = require('../models/base');

const router = express.Router();

async function filterByDangerLevel(applications, dangerLevel) {
  if (!dangerLevel) return applications;
  
  const chemicalIds = await Chemical.findAll({
    where: { dangerLevel },
    attributes: ['id']
  }).then(rows => rows.map(c => c.id));
  
  return applications.filter(app => chemicalIds.includes(app.chemicalId));
}

router.get('/', auth, requirePermission('ledger:view'), async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      keyword,
      chemicalId,
      applicantId,
      department,
      status,
      dangerLevel,
      startDate,
      endDate
    } = req.query;

    const where = {
      status: { [Op.in]: ['completed', 'approved', 'distributing', 'pending', 'rejected'] }
    };

    if (keyword) {
      where[Op.or] = [
        { applyNo: { [Op.like]: `%${keyword}%` } },
        { chemicalName: { [Op.like]: `%${keyword}%` } },
        { applicantName: { [Op.like]: `%${keyword}%` } }
      ];
    }

    if (chemicalId) {
      where.chemicalId = chemicalId;
    }

    if (applicantId) {
      where.applicantId = applicantId;
    }

    if (department) {
      where.department = { [Op.like]: `%${department}%` };
    }

    if (status) {
      where.status = status;
    }

    if (startDate) {
      where.submitTime = { ...where.submitTime, [Op.gte]: new Date(startDate) };
    }

    if (endDate) {
      where.submitTime = { ...where.submitTime, [Op.lte]: new Date(endDate) };
    }

    let { count, rows } = await Application.findAndCountAll({
      where,
      order: [['submitTime', 'DESC'], ['id', 'DESC']]
    });

    if (dangerLevel) {
      rows = await filterByDangerLevel(rows, dangerLevel);
      count = rows.length;
      const start = (Number(page) - 1) * Number(pageSize);
      rows = rows.slice(start, start + Number(pageSize));
    } else {
      rows = rows.slice(0, Number(pageSize));
    }

    const chemicalMap = {};
    const chemicalIds = [...new Set(rows.map(r => r.chemicalId))];
    if (chemicalIds.length > 0) {
      const chemicals = await Chemical.findAll({
        where: { id: { [Op.in]: chemicalIds } },
        attributes: ['id', 'chemicalName', 'casNo', 'specification', 'dangerLevel', 'unit']
      });
      chemicals.forEach(c => { chemicalMap[c.id] = c; });
    }

    const listWithChemical = rows.map(row => ({
      ...row.toJSON(),
      chemical: chemicalMap[row.chemicalId] || null
    }));

    res.json({
      code: 200,
      message: '获取成功',
      data: {
        list: listWithChemical,
        total: count,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(count / Number(pageSize))
      }
    });
  } catch (error) {
    console.error('获取台账列表失败:', error);
    res.status(500).json({ code: 500, message: '获取台账列表失败，请稍后重试' });
  }
});

router.get('/export', auth, requirePermission('ledger:view'), async (req, res) => {
  try {
    const {
      keyword,
      chemicalId,
      applicantId,
      department,
      status,
      dangerLevel,
      startDate,
      endDate
    } = req.query;

    const where = {
      status: { [Op.in]: ['completed', 'approved', 'distributing', 'pending', 'rejected'] }
    };

    if (keyword) {
      where[Op.or] = [
        { applyNo: { [Op.like]: `%${keyword}%` } },
        { chemicalName: { [Op.like]: `%${keyword}%` } },
        { applicantName: { [Op.like]: `%${keyword}%` } }
      ];
    }

    if (chemicalId) {
      where.chemicalId = chemicalId;
    }

    if (applicantId) {
      where.applicantId = applicantId;
    }

    if (department) {
      where.department = { [Op.like]: `%${department}%` };
    }

    if (status) {
      where.status = status;
    }

    if (startDate) {
      where.submitTime = { ...where.submitTime, [Op.gte]: new Date(startDate) };
    }

    if (endDate) {
      where.submitTime = { ...where.submitTime, [Op.lte]: new Date(endDate) };
    }

    let applications = await Application.findAll({
      where,
      order: [['submitTime', 'DESC'], ['id', 'DESC']]
    });

    if (dangerLevel) {
      applications = await filterByDangerLevel(applications, dangerLevel);
    }

    const chemicalIds = [...new Set(applications.map(r => r.chemicalId))];
    const chemicalMap = {};
    if (chemicalIds.length > 0) {
      const chemicals = await Chemical.findAll({
        where: { id: { [Op.in]: chemicalIds } }
      });
      chemicals.forEach(c => { chemicalMap[c.id] = c; });
    }

    const statusMap = {
      draft: '草稿',
      pending: '待审批',
      approved: '已通过',
      rejected: '已驳回',
      distributing: '发放中',
      completed: '已完成',
      cancelled: '已取消'
    };

    const exportData = applications.map(app => {
      const chemical = chemicalMap[app.chemicalId] || {};
      return {
        '申请单号': app.applyNo,
        '申请人': app.applicantName,
        '申请部门': app.department,
        '危化品名称': app.chemicalName,
        'CAS号': chemical.casNo || '',
        '规格': chemical.specification || '',
        '危险等级': chemical.dangerLevel || '',
        '申请数量': `${app.quantity} ${chemical.unit || ''}`,
        '使用用途': app.purpose,
        '使用地点': app.usageLocation,
        '紧急联系人': app.emergencyContact,
        '联系电话': app.emergencyPhone || '',
        '状态': statusMap[app.status] || app.status,
        '提交时间': app.submitTime ? new Date(app.submitTime).toLocaleString() : '',
        '完成时间': app.completeTime ? new Date(app.completeTime).toLocaleString() : '',
        '审批意见': app.approvalOpinion || ''
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    const colWidths = [
      { wch: 20 },
      { wch: 12 },
      { wch: 15 },
      { wch: 20 },
      { wch: 18 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 30 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 }
    ];
    ws['!cols'] = colWidths;

    const dataRange = XLSX.utils.decode_range(ws['!ref']);
    for (let C = 0; C <= dataRange.e.c; ++C) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
      if (cell) {
        cell.s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'FF409EFF' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        };
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, '危化品台账');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `危化品台账_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    
    res.send(buffer);
  } catch (error) {
    console.error('导出台账失败:', error);
    res.status(500).json({ code: 500, message: '导出台账失败，请稍后重试' });
  }
});

router.get('/stats', auth, requirePermission('ledger:view'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {
      status: { [Op.in]: ['completed', 'approved', 'distributing', 'pending', 'rejected'] }
    };

    if (startDate) {
      where.submitTime = { ...where.submitTime, [Op.gte]: new Date(startDate) };
    }

    if (endDate) {
      where.submitTime = { ...where.submitTime, [Op.lte]: new Date(endDate) };
    }

    const applications = await Application.findAll({ where });

    const totalApplications = applications.length;
    const totalQuantity = applications.reduce((sum, app) => sum + (Number(app.quantity) || 0), 0);

    const statusMapData = {};
    const chemicalMapData = {};
    const departmentMapData = {};

    applications.forEach(app => {
      statusMapData[app.status] = (statusMapData[app.status] || 0) + 1;
      
      const key = `${app.chemicalId}-${app.chemicalName}`;
      chemicalMapData[key] = (chemicalMapData[key] || 0) + Number(app.quantity || 0);
      
      const dept = app.department || '未指定';
      departmentMapData[dept] = (departmentMapData[dept] || 0) + 1;
    });

    const statusMap = {
      draft: '草稿',
      pending: '待审批',
      approved: '已通过',
      rejected: '已驳回',
      distributing: '发放中',
      completed: '已完成',
      cancelled: '已取消'
    };

    const formattedStatusStats = Object.entries(statusMapData).map(([status, count]) => ({
      status,
      statusName: statusMap[status] || status,
      count
    }));

    const chemicalStats = Object.entries(chemicalMapData)
      .map(([key, totalQuantity]) => {
        const [chemicalId, chemicalName] = key.split('-');
        return { chemicalId: Number(chemicalId), chemicalName, totalQuantity: Number(totalQuantity) };
      })
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 10);

    const departmentStats = Object.entries(departmentMapData)
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      code: 200,
      message: '获取成功',
      data: {
        totalApplications,
        totalQuantity: Number(totalQuantity),
        statusStats: formattedStatusStats,
        chemicalStats,
        departmentStats
      }
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ code: 500, message: '获取统计数据失败，请稍后重试' });
  }
});

module.exports = router;
