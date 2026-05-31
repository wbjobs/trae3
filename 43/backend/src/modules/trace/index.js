const { Op } = require('../../config/database');
const { TraceLog, OperationLog } = require('../../models/flow');
const { OperationType, OperationTypeDesc } = require('./OperationType');

function getClientIp(req) {
  if (!req) return null;
  const xForwardedFor = req.headers && req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  const xRealIp = req.headers && req.headers['x-real-ip'];
  if (xRealIp) {
    return xRealIp;
  }
  const socket = req.socket || req.connection;
  if (socket && socket.remoteAddress) {
    return socket.remoteAddress;
  }
  return null;
}

function getUserAgent(req) {
  if (!req || !req.headers) return null;
  return req.headers['user-agent'] || null;
}

async function logOperation({ traceId, applicationId, operatorId, operatorName, operationType, operationDetail, req, transaction }) {
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const operationTime = new Date();

  const options = {};
  if (transaction) {
    options.transaction = transaction;
  }

  return await TraceLog.create({
    traceId,
    applicationId,
    operatorId,
    operatorName,
    operationType,
    operationDetail: typeof operationDetail === 'object' ? JSON.stringify(operationDetail) : operationDetail,
    operationTime,
    ipAddress,
    userAgent
  }, options);
}

async function logCreate(application, user, req, transaction) {
  return await logOperation({
    traceId: application.traceId || `trace-${application.id}-${Date.now()}`,
    applicationId: application.id,
    operatorId: user.id,
    operatorName: user.realName || user.username,
    operationType: OperationType.CREATE,
    operationDetail: {
      applicationId: application.id,
      applicationNo: application.applyNo || application.applicationNo,
      chemicalName: application.chemicalName
    },
    req,
    transaction
  });
}

async function logSubmit(application, user, req, transaction) {
  return await logOperation({
    traceId: application.traceId,
    applicationId: application.id,
    operatorId: user.id,
    operatorName: user.realName || user.username,
    operationType: OperationType.SUBMIT,
    operationDetail: {
      applicationId: application.id,
      applicationNo: application.applyNo || application.applicationNo,
      status: application.status
    },
    req,
    transaction
  });
}

async function logApprove(application, user, opinion, req, transaction) {
  return await logOperation({
    traceId: application.traceId,
    applicationId: application.id,
    operatorId: user.id,
    operatorName: user.realName || user.username,
    operationType: OperationType.APPROVE,
    operationDetail: {
      applicationId: application.id,
      applicationNo: application.applyNo || application.applicationNo,
      opinion,
      status: application.status
    },
    req,
    transaction
  });
}

async function logReject(application, user, opinion, reason, req, transaction) {
  return await logOperation({
    traceId: application.traceId,
    applicationId: application.id,
    operatorId: user.id,
    operatorName: user.realName || user.username,
    operationType: OperationType.REJECT,
    operationDetail: {
      applicationId: application.id,
      applicationNo: application.applyNo || application.applicationNo,
      opinion,
      reason,
      status: application.status
    },
    req,
    transaction
  });
}

async function logModify(application, user, changes, req, transaction) {
  return await logOperation({
    traceId: application.traceId,
    applicationId: application.id,
    operatorId: user.id,
    operatorName: user.realName || user.username,
    operationType: OperationType.MODIFY,
    operationDetail: {
      applicationId: application.id,
      applicationNo: application.applyNo || application.applicationNo,
      changes
    },
    req,
    transaction
  });
}

async function logDistribute(application, user, req, transaction) {
  return await logOperation({
    traceId: application.traceId,
    applicationId: application.id,
    operatorId: user.id,
    operatorName: user.realName || user.username,
    operationType: OperationType.DISTRIBUTE,
    operationDetail: {
      applicationId: application.id,
      applicationNo: application.applyNo || application.applicationNo,
      status: application.status
    },
    req,
    transaction
  });
}

async function logReceive(application, user, req, transaction) {
  return await logOperation({
    traceId: application.traceId,
    applicationId: application.id,
    operatorId: user.id,
    operatorName: user.realName || user.username,
    operationType: OperationType.RECEIVE,
    operationDetail: {
      applicationId: application.id,
      applicationNo: application.applyNo || application.applicationNo,
      status: application.status
    },
    req,
    transaction
  });
}

async function logCancel(application, user, req, transaction) {
  return await logOperation({
    traceId: application.traceId,
    applicationId: application.id,
    operatorId: user.id,
    operatorName: user.realName || user.username,
    operationType: OperationType.CANCEL,
    operationDetail: {
      applicationId: application.id,
      applicationNo: application.applyNo || application.applicationNo,
      status: application.status
    },
    req,
    transaction
  });
}

async function logQuery(applicationId, user, req, transaction) {
  return await logOperation({
    traceId: `query-${applicationId}-${Date.now()}`,
    applicationId,
    operatorId: user.id,
    operatorName: user.realName || user.username,
    operationType: OperationType.QUERY,
    operationDetail: {
      applicationId,
      queryTime: new Date().toISOString()
    },
    req,
    transaction
  });
}

async function getTraceChain(traceId) {
  const logs = await TraceLog.findAll({
    where: { traceId },
    order: [['operationTime', 'ASC']]
  });

  return logs.map(log => {
    const logData = typeof log.toJSON === 'function' ? log.toJSON() : log;
    return {
      ...logData,
      operationTypeDesc: OperationTypeDesc[logData.operationType] || logData.operationType,
      operationDetail: logData.operationDetail ? JSON.parse(logData.operationDetail) : null
    };
  });
}

async function getTraceByApplicationId(applicationId) {
  const logs = await TraceLog.findAll({
    where: { applicationId },
    order: [['operationTime', 'ASC']]
  });

  return logs.map(log => {
    const logData = typeof log.toJSON === 'function' ? log.toJSON() : log;
    return {
      ...logData,
      operationTypeDesc: OperationTypeDesc[logData.operationType] || logData.operationType,
      operationDetail: logData.operationDetail ? JSON.parse(logData.operationDetail) : null
    };
  });
}

async function getOperationLog(params = {}) {
  const {
    page = 1,
    pageSize = 10,
    userId,
    module,
    action,
    startTime,
    endTime
  } = params;

  const where = {};

  if (userId) {
    where.userId = userId;
  }
  if (module) {
    where.module = module;
  }
  if (action) {
    where.action = action;
  }
  if (startTime || endTime) {
    where.operationTime = {};
    if (startTime) {
      where.operationTime[Op.gte] = new Date(startTime);
    }
    if (endTime) {
      where.operationTime[Op.lte] = new Date(endTime);
    }
  }

  const offset = (page - 1) * pageSize;

  const { count, rows } = await OperationLog.findAndCountAll({
    where,
    order: [['operationTime', 'DESC']],
    limit: pageSize,
    offset
  });

  return {
    total: count,
    page,
    pageSize,
    totalPages: Math.ceil(count / pageSize),
    list: rows
  };
}

module.exports = {
  logOperation,
  logCreate,
  logSubmit,
  logApprove,
  logReject,
  logModify,
  logDistribute,
  logReceive,
  logCancel,
  logQuery,
  getTraceChain,
  getTraceByApplicationId,
  getOperationLog,
  OperationType,
  OperationTypeDesc
};
