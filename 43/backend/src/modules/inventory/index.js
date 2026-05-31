const { Op } = require('../../config/database');
const { Chemical } = require('../../models/base');
const { Application } = require('../../models/flow');

const DEFAULT_WARNING_THRESHOLD = 10;
const DEFAULT_DANGER_THRESHOLD = 5;

const WARNING_LEVELS = {
  NORMAL: 'normal',
  WARNING: 'warning',
  DANGER: 'danger'
};

async function getInventoryStats() {
  const chemicals = await Chemical.findAll();
  
  let totalStock = 0;
  let warningCount = 0;
  let dangerCount = 0;
  let normalCount = 0;
  
  const inventoryList = chemicals.map(chemical => {
    const stock = Number(chemical.stock) || 0;
    const warningThreshold = Number(chemical.warningThreshold) || DEFAULT_WARNING_THRESHOLD;
    const dangerThreshold = Number(chemical.dangerThreshold) || DEFAULT_DANGER_THRESHOLD;
    
    let warningLevel = WARNING_LEVELS.NORMAL;
    if (stock <= dangerThreshold) {
      warningLevel = WARNING_LEVELS.DANGER;
      dangerCount++;
    } else if (stock <= warningThreshold) {
      warningLevel = WARNING_LEVELS.WARNING;
      warningCount++;
    } else {
      normalCount++;
    }
    
    totalStock += stock;
    
    return {
      ...chemical,
      currentStock: stock,
      warningLevel,
      warningThreshold,
      dangerThreshold
    };
  });
  
  return {
    totalChemicals: chemicals.length,
    totalStock,
    normalCount,
    warningCount,
    dangerCount,
    inventoryList
  };
}

async function getLowStockChemicals(params = {}) {
  const { page = 1, pageSize = 10, warningLevel, keyword } = params;
  
  const stats = await getInventoryStats();
  let filtered = stats.inventoryList;
  
  if (warningLevel) {
    filtered = filtered.filter(item => item.warningLevel === warningLevel);
  }
  
  if (keyword) {
    const keywordLower = keyword.toLowerCase();
    filtered = filtered.filter(item => 
      item.chemicalName?.toLowerCase().includes(keywordLower) ||
      item.casNo?.toLowerCase().includes(keywordLower) ||
      item.specification?.toLowerCase().includes(keywordLower)
    );
  }
  
  const count = filtered.length;
  const start = (Number(page) - 1) * Number(pageSize);
  const list = filtered.slice(start, start + Number(pageSize));
  
  return {
    list,
    count,
    totalChemicals: stats.totalChemicals,
    warningCount: stats.warningCount,
    dangerCount: stats.dangerCount,
    page: Number(page),
    pageSize: Number(pageSize)
  };
}

async function setWarningThreshold(chemicalId, data = {}) {
  const { warningThreshold, dangerThreshold } = data;
  
  const chemical = await Chemical.findByPk(chemicalId);
  if (!chemical) {
    throw new Error(`危化品ID ${chemicalId} 不存在`);
  }
  
  const updateData = {};
  if (warningThreshold !== undefined) {
    updateData.warningThreshold = Number(warningThreshold);
  }
  if (dangerThreshold !== undefined) {
    updateData.dangerThreshold = Number(dangerThreshold);
  }
  
  await Chemical.update(updateData, {
    where: { id: chemicalId }
  });
  
  const updated = await Chemical.findByPk(chemicalId);
  return updated;
}

async function checkStockAndCreateAlert(chemicalId, quantity) {
  const chemical = await Chemical.findByPk(chemicalId);
  if (!chemical) {
    return null;
  }
  
  const currentStock = Number(chemical.stock) || 0;
  const remainingStock = currentStock - Number(quantity);
  const warningThreshold = Number(chemical.warningThreshold) || DEFAULT_WARNING_THRESHOLD;
  const dangerThreshold = Number(chemical.dangerThreshold) || DEFAULT_DANGER_THRESHOLD;
  
  let warningLevel = WARNING_LEVELS.NORMAL;
  if (remainingStock <= dangerThreshold) {
    warningLevel = WARNING_LEVELS.DANGER;
  } else if (remainingStock <= warningThreshold) {
    warningLevel = WARNING_LEVELS.WARNING;
  }
  
  if (warningLevel !== WARNING_LEVELS.NORMAL) {
    return {
      chemicalId,
      chemicalName: chemical.chemicalName,
      currentStock,
      remainingStock,
      warningLevel,
      warningThreshold,
      dangerThreshold,
      message: `危化品【${chemical.chemicalName}】库存${warningLevel === WARNING_LEVELS.DANGER ? '严重' : ''}不足，剩余库存：${remainingStock}${chemical.unit || ''}`
    };
  }
  
  return null;
}

async function getMonthlyUsageStats(chemicalId, months = 6) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  
  const where = {
    chemicalId: Number(chemicalId),
    status: { [Op.in]: ['completed', 'approved', 'distributing'] },
    submitTime: { [Op.gte]: startDate }
  };
  
  const applications = await Application.findAll({
    where,
    order: [['submitTime', 'ASC']]
  });
  
  const monthlyStats = {};
  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyStats[key] = {
      month: key,
      quantity: 0,
      count: 0
    };
  }
  
  applications.forEach(app => {
    const submitDate = new Date(app.submitTime);
    const key = `${submitDate.getFullYear()}-${String(submitDate.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyStats[key]) {
      monthlyStats[key].quantity += Number(app.quantity) || 0;
      monthlyStats[key].count += 1;
    }
  });
  
  return Object.values(monthlyStats).reverse();
}

async function getStockAlertList() {
  const result = await getLowStockChemicals({
    page: 1,
    pageSize: 100,
    warningLevel: WARNING_LEVELS.WARNING
  });
  
  const dangerResult = await getLowStockChemicals({
    page: 1,
    pageSize: 100,
    warningLevel: WARNING_LEVELS.DANGER
  });
  
  return {
    warnings: result.list,
    dangers: dangerResult.list,
    totalAlerts: result.count + dangerResult.count
  };
}

module.exports = {
  DEFAULT_WARNING_THRESHOLD,
  DEFAULT_DANGER_THRESHOLD,
  WARNING_LEVELS,
  getInventoryStats,
  getLowStockChemicals,
  setWarningThreshold,
  checkStockAndCreateAlert,
  getMonthlyUsageStats,
  getStockAlertList
};
