import Router from 'koa-router'
import auditController from '../controller/AuditController.js'
import authMiddleware from '../middleware/auth.js'
import validateMiddleware from '../middleware/validator.js'

const router = new Router({ prefix: '/api/audit' })

router.get(
  '/logs',
  authMiddleware('audit:view'),
  validateMiddleware('auditQuery', 'query'),
  auditController.getAuditLogs.bind(auditController)
)

router.get(
  '/trace/:traceId',
  authMiddleware('audit:view'),
  validateMiddleware('traceQuery', 'params'),
  auditController.getTraceDetail.bind(auditController)
)

router.get(
  '/stats',
  authMiddleware('audit:view'),
  auditController.getAuditStats.bind(auditController)
)

router.get(
  '/module-stats',
  authMiddleware('audit:view'),
  auditController.getModuleStats.bind(auditController)
)

router.get(
  '/user-stats',
  authMiddleware('audit:view'),
  auditController.getUserStats.bind(auditController)
)

router.get(
  '/export',
  authMiddleware('audit:view'),
  validateMiddleware('auditQuery', 'query'),
  auditController.exportLogs.bind(auditController)
)

export default router
