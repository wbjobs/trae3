const OperationType = {
  CREATE: 'create',
  SUBMIT: 'submit',
  APPROVE: 'approve',
  REJECT: 'reject',
  MODIFY: 'modify',
  DISTRIBUTE: 'distribute',
  RECEIVE: 'receive',
  CANCEL: 'cancel',
  QUERY: 'query'
};

const OperationTypeDesc = {
  [OperationType.CREATE]: '创建',
  [OperationType.SUBMIT]: '提交',
  [OperationType.APPROVE]: '审批通过',
  [OperationType.REJECT]: '驳回',
  [OperationType.MODIFY]: '修改',
  [OperationType.DISTRIBUTE]: '发放',
  [OperationType.RECEIVE]: '接收',
  [OperationType.CANCEL]: '取消',
  [OperationType.QUERY]: '查询'
};

module.exports = {
  OperationType,
  OperationTypeDesc
};
