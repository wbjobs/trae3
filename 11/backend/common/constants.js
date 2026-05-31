const DEVICE_TYPES = {
  AP: 'ap',
  REPEATER: 'repeater',
  ENDPOINT: 'endpoint'
};

const DEVICE_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  WARNING: 'warning'
};

const ALERT_SEVERITY = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info'
};

const ALERT_STATUS = {
  ACTIVE: 'active',
  RESOLVED: 'resolved'
};

const OPERATORS = {
  GT: 'gt',
  LT: 'lt',
  GTE: 'gte',
  LTE: 'lte',
  EQ: 'eq',
  NEQ: 'neq'
};

const SIGNAL_QUALITY = {
  EXCELLENT: { min: -50, color: '#67C23A', label: '优秀' },
  GOOD: { min: -65, color: '#409EFF', label: '良好' },
  FAIR: { min: -75, color: '#E6A23C', label: '一般' },
  POOR: { min: -100, color: '#F56C6C', label: '较差' }
};

const WS_MESSAGE_TYPES = {
  SIGNAL_UPDATE: 'signal_update',
  ALERT_CREATED: 'alert_created',
  DEVICE_STATUS: 'device_status',
  TOPOLOGY_CHANGE: 'topology_change',
  PARTIAL_UPDATE: 'partial_update',
  BATCH_UPDATE: 'batch_update',
  FULL_REFRESH: 'full_refresh'
};

const LINK_TYPE = {
  WIRELESS: 'wireless',
  WIRED: 'wired'
};

module.exports = {
  DEVICE_TYPES,
  DEVICE_STATUS,
  ALERT_SEVERITY,
  ALERT_STATUS,
  OPERATORS,
  SIGNAL_QUALITY,
  WS_MESSAGE_TYPES,
  LINK_TYPE
};
