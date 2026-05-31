import { EventEmitter } from 'events'

const ROLES = {
  ADMIN: 'admin',
  ENGINEER: 'engineer',
  OPERATOR: 'operator',
  VIEWER: 'viewer'
}

const PERMISSIONS = {
  DEVICE_VIEW: 'device:view',
  DEVICE_CONTROL: 'device:control',
  DEVICE_CONFIG: 'device:config',
  
  ALARM_VIEW: 'alarm:view',
  ALARM_ACKNOWLEDGE: 'alarm:acknowledge',
  ALARM_DELETE: 'alarm:delete',
  
  USER_MANAGE: 'user:manage',
  SYSTEM_CONFIG: 'system:config',
  
  COMMAND_START: 'command:start',
  COMMAND_STOP: 'command:stop',
  COMMAND_SPEED: 'command:speed',
  COMMAND_MODE: 'command:mode',
  COMMAND_MAINTENANCE: 'command:maintenance'
}

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  
  [ROLES.ENGINEER]: [
    PERMISSIONS.DEVICE_VIEW,
    PERMISSIONS.DEVICE_CONTROL,
    PERMISSIONS.DEVICE_CONFIG,
    PERMISSIONS.ALARM_VIEW,
    PERMISSIONS.ALARM_ACKNOWLEDGE,
    PERMISSIONS.COMMAND_START,
    PERMISSIONS.COMMAND_STOP,
    PERMISSIONS.COMMAND_SPEED,
    PERMISSIONS.COMMAND_MODE,
    PERMISSIONS.COMMAND_MAINTENANCE
  ],
  
  [ROLES.OPERATOR]: [
    PERMISSIONS.DEVICE_VIEW,
    PERMISSIONS.DEVICE_CONTROL,
    PERMISSIONS.ALARM_VIEW,
    PERMISSIONS.ALARM_ACKNOWLEDGE,
    PERMISSIONS.COMMAND_START,
    PERMISSIONS.COMMAND_STOP,
    PERMISSIONS.COMMAND_SPEED
  ],
  
  [ROLES.VIEWER]: [
    PERMISSIONS.DEVICE_VIEW,
    PERMISSIONS.ALARM_VIEW
  ]
}

const COMMAND_PERMISSIONS = {
  start: PERMISSIONS.COMMAND_START,
  stop: PERMISSIONS.COMMAND_STOP,
  setSpeed: PERMISSIONS.COMMAND_SPEED,
  setMode: PERMISSIONS.COMMAND_MODE,
  maintenance: PERMISSIONS.COMMAND_MAINTENANCE
}

class PermissionManager extends EventEmitter {
  constructor() {
    super()
    this.users = new Map()
    this.auditLogs = []
    this.maxAuditLogs = 1000
  }

  addUser(userId, name, role = ROLES.VIEWER) {
    const user = {
      id: userId,
      name,
      role,
      permissions: this.getPermissionsByRole(role),
      createdAt: Date.now()
    }
    
    this.users.set(userId, user)
    this.logAudit('user:create', userId, { role })
    
    return user
  }

  updateUserRole(userId, newRole, operatorId) {
    const user = this.users.get(userId)
    if (!user) {
      return { success: false, error: '用户不存在' }
    }
    
    if (!this.hasPermission(operatorId, PERMISSIONS.USER_MANAGE)) {
      return { success: false, error: '无权限修改用户角色' }
    }
    
    const oldRole = user.role
    user.role = newRole
    user.permissions = this.getPermissionsByRole(newRole)
    
    this.logAudit('user:updateRole', operatorId, { userId, oldRole, newRole })
    
    return { success: true, user }
  }

  getPermissionsByRole(role) {
    return ROLE_PERMISSIONS[role] || []
  }

  hasPermission(userId, permission) {
    const user = this.users.get(userId)
    if (!user) return false
    
    return user.permissions.includes(permission)
  }

  hasAnyPermission(userId, permissions) {
    return permissions.some(p => this.hasPermission(userId, p))
  }

  checkCommandPermission(userId, command) {
    const requiredPermission = COMMAND_PERMISSIONS[command]
    
    if (!requiredPermission) {
      return { allowed: true, reason: '无需权限' }
    }
    
    const allowed = this.hasPermission(userId, requiredPermission)
    
    return {
      allowed,
      reason: allowed ? '权限验证通过' : `缺少权限: ${requiredPermission}`
    }
  }

  canExecuteCommand(userId, command) {
    const result = this.checkCommandPermission(userId, command)
    this.logAudit('command:check', userId, { command, allowed: result.allowed })
    return result
  }

  getUser(userId) {
    return this.users.get(userId) || null
  }

  getAllUsers() {
    return Array.from(this.users.values())
  }

  getUsersByRole(role) {
    return Array.from(this.users.values()).filter(u => u.role === role)
  }

  removeUser(userId) {
    const exists = this.users.has(userId)
    if (exists) {
      this.logAudit('user:delete', userId, {})
    }
    this.users.delete(userId)
    return exists
  }

  logAudit(action, userId, details = {}) {
    const log = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      action,
      userId,
      userName: this.users.get(userId)?.name || 'unknown',
      details,
      timestamp: Date.now()
    }
    
    this.auditLogs.unshift(log)
    
    if (this.auditLogs.length > this.maxAuditLogs) {
      this.auditLogs = this.auditLogs.slice(0, this.maxAuditLogs)
    }
    
    this.emit('audit', log)
  }

  getAuditLogs(filters = {}) {
    let logs = [...this.auditLogs]
    
    if (filters.userId) {
      logs = logs.filter(l => l.userId === filters.userId)
    }
    if (filters.action) {
      logs = logs.filter(l => l.action === filters.action)
    }
    if (filters.startTime) {
      logs = logs.filter(l => l.timestamp >= filters.startTime)
    }
    if (filters.endTime) {
      logs = logs.filter(l => l.timestamp <= filters.endTime)
    }
    
    return logs
  }

  getAuditStats() {
    const stats = {
      total: this.auditLogs.length,
      byAction: {},
      byUser: {},
      lastHour: 0
    }
    
    const oneHourAgo = Date.now() - 3600 * 1000
    
    this.auditLogs.forEach(log => {
      stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1
      stats.byUser[log.userName] = (stats.byUser[log.userName] || 0) + 1
      
      if (log.timestamp >= oneHourAgo) {
        stats.lastHour++
      }
    })
    
    return stats
  }

  exportAuditLogs() {
    return JSON.stringify(this.auditLogs, null, 2)
  }

  clearAuditLogs() {
    this.auditLogs = []
  }
}

PermissionManager.ROLES = ROLES
PermissionManager.PERMISSIONS = PERMISSIONS

export default PermissionManager
