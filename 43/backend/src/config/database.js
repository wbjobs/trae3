const path = require('path');
const fs = require('fs');
const { JSONFileDB } = require('./json-db');

const dbPath = path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

const baseDB = new JSONFileDB(path.join(dbPath, 'chemical_base.json'), {
  users: [],
  roles: [],
  chemicals: [],
  permissions: []
});

const flowDB = new JSONFileDB(path.join(dbPath, 'chemical_flow.json'), {
  applications: [],
  approvalRecords: [],
  traceLogs: [],
  operationLogs: []
});

async function initBaseDB() {
  try {
    await baseDB.init();
    console.log('基础数据库连接成功');
    return true;
  } catch (error) {
    console.error('基础数据库初始化失败:', error);
    throw error;
  }
}

async function initFlowDB() {
  try {
    await flowDB.init();
    console.log('流转数据库连接成功');
    return true;
  } catch (error) {
    console.error('流转数据库初始化失败:', error);
    throw error;
  }
}

async function initDatabases() {
  await initBaseDB();
  await initFlowDB();
  console.log('双数据库初始化完成');
}

const DataTypes = {
  INTEGER: 'INTEGER',
  STRING: 'STRING',
  TEXT: 'TEXT',
  DECIMAL: 'DECIMAL',
  TINYINT: 'TINYINT',
  DATE: 'DATE',
  BOOLEAN: 'BOOLEAN',
  JSON: 'JSON',
  ENUM: 'ENUM'
};

const Op = {
  eq: 'eq',
  ne: 'ne',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  like: 'like',
  in: 'in',
  notIn: 'notIn',
  or: 'or',
  and: 'and'
};

module.exports = {
  baseDB,
  flowDB,
  sequelize: { baseDB, flowDB },
  initBaseDB,
  initFlowDB,
  initDatabases,
  DataTypes,
  Op
};
