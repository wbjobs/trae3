const STEP_MAPPING = {
  1: '部门负责人审批',
  2: '安全管理员审核',
  3: '仓库管理员发放'
};

const ROLE_STEP_PERMISSIONS = {
  1: ['approver', 'admin'],
  2: ['safety', 'admin'],
  3: ['warehouse', 'admin']
};

const STEP_TRANSITIONS = {
  1: { next: 2, action: 'dept_approved' },
  2: { next: 3, action: 'safety_approved' },
  3: { next: null, action: 'completed' }
};

const FINAL_STEP = 3;

const FLOW_CONFIG = {
  autoSkipSameRole: true,
  notifyOnStepChange: true,
  requireAllApprovals: false,
  allowAutoComplete: true
};

function getStepName(step) {
  return STEP_MAPPING[step] || '未知步骤';
}

function getNextStep(currentStep) {
  const step = Number(currentStep);
  if (step >= FINAL_STEP) {
    return null;
  }
  return step + 1;
}

function canApprove(step, userRoleCode) {
  const allowedRoles = ROLE_STEP_PERMISSIONS[step];
  if (!allowedRoles) {
    return false;
  }
  return allowedRoles.includes(userRoleCode);
}

function getApprovalRoles(step) {
  return ROLE_STEP_PERMISSIONS[step] || [];
}

function getAllSteps() {
  return Object.keys(STEP_MAPPING).map(Number).sort((a, b) => a - b);
}

function getStepPermissions() {
  return { ...ROLE_STEP_PERMISSIONS };
}

function getStepTransition(step) {
  return STEP_TRANSITIONS[step] || null;
}

function isFinalStep(step) {
  return Number(step) >= FINAL_STEP;
}

function getFlowConfig() {
  return { ...FLOW_CONFIG };
}

function getNextStepsWithRoles(currentStep, userRoleCode) {
  const steps = [];
  let nextStep = getNextStep(currentStep);
  
  while (nextStep) {
    const roles = getApprovalRoles(nextStep);
    steps.push({
      step: nextStep,
      name: getStepName(nextStep),
      roles,
      canCurrentUserApprove: roles.includes(userRoleCode)
    });
    
    if (FLOW_CONFIG.autoSkipSameRole && roles.includes(userRoleCode)) {
      break;
    }
    
    nextStep = getNextStep(nextStep);
  }
  
  return steps;
}

module.exports = {
  STEP_MAPPING,
  ROLE_STEP_PERMISSIONS,
  STEP_TRANSITIONS,
  FINAL_STEP,
  FLOW_CONFIG,
  getStepName,
  getNextStep,
  canApprove,
  getApprovalRoles,
  getAllSteps,
  getStepPermissions,
  getStepTransition,
  isFinalStep,
  getFlowConfig,
  getNextStepsWithRoles
};
