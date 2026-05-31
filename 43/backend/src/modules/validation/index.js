const { Chemical, User, Role } = require('../../models/base');
const { Application } = require('../../models/flow');
const {
  MAX_QUANTITY_BY_LEVEL,
  DANGER_LEVELS,
  APPLICATION_STATUSES,
  PHONE_REGEX
} = require('./constants');

const APPROVAL_STEP_PERMISSIONS = {
  1: 'approval:dept',
  2: 'approval:safety',
  3: 'approval:warehouse'
};

function validateApplication(data, type = 'create') {
  if (type === 'create') {
    if (!data.chemicalId) {
      return { valid: false, message: '危化品ID不能为空' };
    }
    if (!data.quantity || data.quantity <= 0) {
      return { valid: false, message: '申请数量必须大于0' };
    }
    if (!data.purpose || !data.purpose.trim()) {
      return { valid: false, message: '使用用途不能为空' };
    }
    if (!data.usageLocation || !data.usageLocation.trim()) {
      return { valid: false, message: '使用地点不能为空' };
    }
    if (!data.emergencyContact || !data.emergencyContact.trim()) {
      return { valid: false, message: '紧急联系人不能为空' };
    }
    return { valid: true, message: '校验通过' };
  }

  if (type === 'submit') {
    const requiredFields = [
      'chemicalId', 'chemicalName', 'quantity', 'purpose',
      'usageLocation', 'emergencyContact', 'applicantId',
      'applicantName', 'department'
    ];

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null || 
          (typeof data[field] === 'string' && !data[field].trim())) {
        return { valid: false, message: `${field}不能为空` };
      }
    }

    if (data.quantity <= 0) {
      return { valid: false, message: '申请数量必须大于0' };
    }

    const phoneCheck = validateEmergencyContact(data.emergencyContact);
    if (!phoneCheck.valid) {
      return phoneCheck;
    }

    return { valid: true, message: '校验通过' };
  }

  return { valid: false, message: '无效的校验类型' };
}

async function validateQuantity(chemicalId, quantity) {
  const chemical = await Chemical.findByPk(chemicalId);
  if (!chemical) {
    return { valid: false, message: '危化品不存在' };
  }

  if (parseFloat(chemical.stock) < parseFloat(quantity)) {
    return { valid: false, message: `库存不足，当前库存：${chemical.stock} ${chemical.unit}` };
  }

  const maxQuantity = MAX_QUANTITY_BY_LEVEL[chemical.dangerLevel] || MAX_QUANTITY_BY_LEVEL['其他'];
  if (parseFloat(quantity) > maxQuantity) {
    return { 
      valid: false, 
      message: `单次申领数量超过上限，${chemical.dangerLevel}危化品单次申领上限为${maxQuantity}${chemical.unit}` 
    };
  }

  return { valid: true, message: '库存校验通过' };
}

async function validateApprovalPermission(application, user) {
  if (application.status !== 'pending') {
    return { valid: false, message: '申请单状态不是待审批，无法审批' };
  }

  if (application.applicantId === user.id) {
    return { valid: false, message: '不能审批自己提交的申请' };
  }

  const userWithRole = await User.findByPk(user.id, {
    include: [{ model: Role, as: 'role' }]
  });

  if (!userWithRole || !userWithRole.role) {
    return { valid: false, message: '用户角色信息不存在' };
  }

  const requiredPermission = APPROVAL_STEP_PERMISSIONS[application.currentStep];
  if (!requiredPermission) {
    return { valid: false, message: '无效的审批步骤' };
  }

  const permissions = userWithRole.role.permissions || [];
  if (!permissions.includes(requiredPermission) && !permissions.includes('approval:do')) {
    return { valid: false, message: '您没有当前审批步骤的权限' };
  }

  return { valid: true, message: '审批权限校验通过' };
}

async function validateUserPermission(user, permissionCode) {
  if (user.status !== 1) {
    return { valid: false, message: '用户账号已被禁用' };
  }

  const userWithRole = await User.findByPk(user.id, {
    include: [{ model: Role, as: 'role' }]
  });

  if (!userWithRole || !userWithRole.role) {
    return { valid: false, message: '用户角色信息不存在' };
  }

  const permissions = userWithRole.role.permissions || [];
  if (!permissions.includes(permissionCode)) {
    return { valid: false, message: '权限不足' };
  }

  return { valid: true, message: '权限校验通过' };
}

async function validateDistributePermission(application, user) {
  if (application.status !== 'approved') {
    return { valid: false, message: '申请单状态不是已通过，无法发放' };
  }

  const permissionCheck = await validateUserPermission(user, 'distribute:do');
  if (!permissionCheck.valid) {
    return permissionCheck;
  }

  return { valid: true, message: '发放权限校验通过' };
}

function validatePhone(phone) {
  if (!phone) {
    return { valid: false, message: '手机号不能为空' };
  }

  if (!PHONE_REGEX.test(phone)) {
    return { valid: false, message: '手机号格式不正确' };
  }

  return { valid: true, message: '手机号格式正确' };
}

function validateEmergencyContact(contact) {
  if (!contact) {
    return { valid: false, message: '紧急联系人不能为空' };
  }

  const parts = contact.split(/[,，\s]+/);
  if (parts.length < 2) {
    return { valid: false, message: '紧急联系人格式应为"姓名,手机号"' };
  }

  const name = parts[0].trim();
  const phone = parts[1].trim();

  if (!name) {
    return { valid: false, message: '紧急联系人姓名不能为空' };
  }

  return validatePhone(phone);
}

module.exports = {
  validateApplication,
  validateQuantity,
  validateApprovalPermission,
  validateUserPermission,
  validateDistributePermission,
  validatePhone,
  validateEmergencyContact,
  ...require('./constants')
};
