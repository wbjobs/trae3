const { v4: uuidv4 } = require('uuid');
const { Op } = require('../../config/database');
const { flowDB } = require('../../config/database');
const { Application, ApprovalRecord } = require('../../models/flow');
const { Chemical, User, Role } = require('../../models/base');
const ApprovalFlow = require('./ApprovalFlow');
const validation = require('../validation');
const trace = require('../trace');

function generateApplyNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const datePart = `${hours}${year}${month}${day}`;
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `${datePart}${random}`;
}

function generateTraceId() {
  return uuidv4();
}

async function getUserRoleCode(user) {
  if (user.roleCode) {
    return user.roleCode;
  }
  if (user.role && user.role.roleCode) {
    return user.role.roleCode;
  }
  const userWithRole = await User.findByPk(user.id);
  if (!userWithRole) return 'user';
  const role = await Role.findByPk(userWithRole.roleId);
  return role?.roleCode || 'user';
}

async function createApplication(data, user, req) {
  const validationResult = validation.validateApplication(data, 'create');
  if (!validationResult.valid) {
    throw new Error(validationResult.message);
  }

  const userExists = await User.findByPk(user.id);
  if (!userExists) {
    throw new Error(`用户ID ${user.id} 不存在`);
  }

  const chemicalExists = await Chemical.findByPk(data.chemicalId);
  if (!chemicalExists) {
    throw new Error(`危化品ID ${data.chemicalId} 不存在`);
  }

  const applyNo = generateApplyNo();
  const traceId = generateTraceId();

  const application = await Application.create({
    applyNo,
    traceId,
    applicantId: user.id,
    applicantName: user.realName || user.username,
    department: data.department || user.department || '',
    chemicalId: data.chemicalId,
    chemicalName: data.chemicalName || chemicalExists.chemicalName,
    casNo: chemicalExists.casNo || '',
    specification: chemicalExists.specification || '',
    unit: chemicalExists.unit || '',
    dangerLevel: chemicalExists.dangerLevel || '',
    quantity: data.quantity,
    purpose: data.purpose,
    usageLocation: data.usageLocation,
    emergencyContact: data.emergencyContact,
    emergencyPhone: data.emergencyPhone,
    status: 'draft',
    currentStep: 0
  });

  await trace.logCreate(application, user, req || { ip: '127.0.0.1', headers: { 'user-agent': 'system' } });
  return application;
}

async function submitApplication(applicationId, user, req) {
  return flowDB.transaction(async () => {
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error(`申请单ID ${applicationId} 不存在`);
    }

    if (!['draft'].includes(application.status)) {
      throw new Error(`申请单状态为 ${application.status}，无法提交`);
    }

    if (application.applicantId !== user.id) {
      throw new Error('只能提交自己创建的申请单');
    }

    const stockResult = await validation.validateQuantity(application.chemicalId, application.quantity);
    if (!stockResult.valid) {
      throw new Error(stockResult.message);
    }

    await Application.update({
      status: 'pending',
      currentStep: 1,
      submitTime: new Date()
    }, {
      where: { id: applicationId }
    });

    const updatedApp = await Application.findByPk(applicationId);
    await trace.logSubmit(updatedApp, user, req || { ip: '127.0.0.1', headers: { 'user-agent': 'system' } });
    return updatedApp;
  });
}

async function approveApplication(applicationId, data = {}, user, req) {
  return flowDB.transaction(async () => {
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error(`申请单ID ${applicationId} 不存在`);
    }

    if (!['pending'].includes(application.status)) {
      throw new Error(`申请单状态为 ${application.status}，无法审批`);
    }

    const permissionResult = await validation.validateApprovalPermission(application, user);
    if (!permissionResult.valid) {
      throw new Error(permissionResult.message);
    }

    const opinion = data.opinion || data.remark || '同意';
    const userRoleCode = await getUserRoleCode(user);
    
    let currentStep = application.currentStep;
    let nextStep = ApprovalFlow.getNextStep(currentStep);
    
    await ApprovalRecord.create({
      applicationId: application.id,
      approverId: user.id,
      approverName: user.realName || user.username,
      approvalStep: currentStep,
      action: 'approve',
      opinion: opinion.trim(),
      nextStep
    });

    const config = ApprovalFlow.getFlowConfig();
    if (config.autoSkipSameRole && nextStep) {
      const nextStepRoles = ApprovalFlow.getApprovalRoles(nextStep);
      while (nextStep && nextStepRoles.includes(userRoleCode)) {
        await ApprovalRecord.create({
          applicationId: application.id,
          approverId: user.id,
          approverName: user.realName || user.username,
          approvalStep: nextStep,
          action: 'approve',
          opinion: '自动审批（同角色）',
          nextStep: ApprovalFlow.getNextStep(nextStep),
          autoApproved: true
        });
        currentStep = nextStep;
        nextStep = ApprovalFlow.getNextStep(currentStep);
      }
    }

    const updateData = {};
    if (nextStep) {
      updateData.currentStep = nextStep;
      updateData.status = 'pending';
    } else {
      updateData.status = 'approved';
      updateData.currentStep = ApprovalFlow.FINAL_STEP;
    }

    await Application.update(updateData, {
      where: { id: applicationId }
    });

    const updatedApp = await Application.findByPk(applicationId);
    await trace.logApprove(updatedApp, user, opinion.trim(), req || { ip: '127.0.0.1', headers: { 'user-agent': 'system' } });
    return updatedApp;
  });
}

async function rejectApplication(applicationId, data = {}, user, req) {
  return flowDB.transaction(async () => {
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error(`申请单ID ${applicationId} 不存在`);
    }

    if (!['pending'].includes(application.status)) {
      throw new Error(`申请单状态为 ${application.status}，无法驳回`);
    }

    const permissionResult = await validation.validateApprovalPermission(application, user);
    if (!permissionResult.valid) {
      throw new Error(permissionResult.message);
    }

    const opinion = data.opinion || data.remark || '驳回';
    const reason = data.reason || 'other';

    await ApprovalRecord.create({
      applicationId: application.id,
      approverId: user.id,
      approverName: user.realName || user.username,
      approvalStep: application.currentStep,
      action: 'reject',
      opinion: opinion.trim(),
      nextStep: null
    });

    await Application.update({
      status: 'rejected',
      rejectReason: reason.trim()
    }, {
      where: { id: applicationId }
    });

    const updatedApp = await Application.findByPk(applicationId);
    await trace.logReject(updatedApp, user, opinion.trim(), reason.trim(), req || { ip: '127.0.0.1', headers: { 'user-agent': 'system' } });
    return updatedApp;
  });
}

async function distributeApplication(applicationId, user, req) {
  return flowDB.transaction(async () => {
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error(`申请单ID ${applicationId} 不存在`);
    }

    if (!['approved'].includes(application.status)) {
      throw new Error(`申请单状态为 ${application.status}，无法发放`);
    }

    const distributePermission = await validation.validateDistributePermission(application, user);
    if (!distributePermission.valid) {
      throw new Error(distributePermission.message);
    }

    const chemical = await Chemical.findByPk(application.chemicalId);
    if (!chemical) {
      throw new Error(`危化品ID ${application.chemicalId} 不存在`);
    }

    if (Number(chemical.stock) < Number(application.quantity)) {
      throw new Error(
        `危化品库存不足，当前库存：${chemical.stock}，申请数量：${application.quantity}`
      );
    }

    await Application.update({
      status: 'distributing'
    }, {
      where: { id: applicationId }
    });

    await Chemical.update({
      stock: Number(chemical.stock) - Number(application.quantity)
    }, {
      where: { id: application.chemicalId }
    });

    await ApprovalRecord.create({
      applicationId: application.id,
      approverId: user.id,
      approverName: user.realName || user.username,
      approvalStep: 3,
      action: 'approve',
      opinion: '仓库发放完成',
      nextStep: null
    });

    await Application.update({
      status: 'completed',
      completeTime: new Date()
    }, {
      where: { id: applicationId }
    });

    const updatedApp = await Application.findByPk(applicationId);
    await trace.logDistribute(updatedApp, user, req || { ip: '127.0.0.1', headers: { 'user-agent': 'system' } });
    return updatedApp;
  });
}

async function cancelApplication(applicationId, user, req) {
  return flowDB.transaction(async () => {
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error(`申请单ID ${applicationId} 不存在`);
    }

    if (!['draft', 'pending'].includes(application.status)) {
      throw new Error(`申请单状态为 ${application.status}，无法取消`);
    }

    if (application.applicantId !== user.id) {
      const userRoleCode = await getUserRoleCode(user);
      if (userRoleCode !== 'admin') {
        throw new Error('只能取消自己创建的申请单');
      }
    }

    await Application.update({
      status: 'cancelled'
    }, {
      where: { id: applicationId }
    });

    const updatedApp = await Application.findByPk(applicationId);
    await trace.logCancel(updatedApp, user, req || { ip: '127.0.0.1', headers: { 'user-agent': 'system' } });
    return updatedApp;
  });
}

async function getApplicationList(params = {}, user, req) {
  const { page = 1, pageSize = 10, status, keyword, startDate, endDate } = params;

  const userRoleCode = await getUserRoleCode(user);
  const where = {};

  if (userRoleCode !== 'admin') {
    where.applicantId = user.id;
  }

  if (status) {
    where.status = status;
  }

  if (keyword) {
    where[Op.or] = [
      { applyNo: { [Op.like]: `%${keyword}%` } },
      { chemicalName: { [Op.like]: `%${keyword}%` } },
      { applicantName: { [Op.like]: `%${keyword}%` } }
    ];
  }

  if (startDate) {
    where.submitTime = { ...where.submitTime, [Op.gte]: new Date(startDate) };
  }

  if (endDate) {
    where.submitTime = { ...where.submitTime, [Op.lte]: new Date(endDate) };
  }

  const { count, rows } = await Application.findAndCountAll({
    where,
    order: [['submitTime', 'DESC'], ['id', 'DESC']],
    limit: Number(pageSize),
    offset: (Number(page) - 1) * Number(pageSize)
  });

  return {
    list: rows,
    total: count,
    page: Number(page),
    pageSize: Number(pageSize),
    totalPages: Math.ceil(count / Number(pageSize))
  };
}

async function getApplicationDetail(id, user, req) {
  const application = await Application.findByPk(id);
  if (!application) {
    throw new Error(`申请单ID ${id} 不存在`);
  }

  const userRoleCode = await getUserRoleCode(user);
  if (userRoleCode !== 'admin' && application.applicantId !== user.id) {
    const canApprove = ApprovalFlow.canApprove(application.currentStep, userRoleCode);
    if (!canApprove) {
      throw new Error('无权查看该申请单详情');
    }
  }

  const approvalRecords = await ApprovalRecord.findAll({
    where: { applicationId: id },
    order: [['id', 'ASC']]
  });

  const traceLogs = await trace.getTraceByApplicationId(id);

  await trace.logQuery(id, user, req || { ip: '127.0.0.1', headers: { 'user-agent': 'system' } });

  return {
    ...application,
    approvalRecords,
    traceLogs
  };
}

async function getApprovalList(user) {
  const userRoleCode = await getUserRoleCode(user);
  
  const steps = [];
  for (let i = 1; i <= 3; i++) {
    if (ApprovalFlow.canApprove(i, userRoleCode)) {
      steps.push(i);
    }
  }

  if (steps.length === 0) {
    return { list: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  }

  const where = {
    status: 'pending',
    currentStep: { [Op.in]: steps }
  };

  const { count, rows } = await Application.findAndCountAll({
    where,
    order: [['submitTime', 'DESC'], ['id', 'DESC']]
  });

  return {
    list: rows,
    total: count,
    page: 1,
    pageSize: count,
    totalPages: 1
  };
}

module.exports = {
  createApplication,
  submitApplication,
  approveApplication,
  rejectApplication,
  distributeApplication,
  cancelApplication,
  getApplicationList,
  getApplicationDetail,
  getApprovalList,
  generateApplyNo,
  generateTraceId
};
