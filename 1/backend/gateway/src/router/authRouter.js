import Router from 'koa-router'
import authController from '../controller/AuthController.js'
import authMiddleware from '../middleware/auth.js'
import validateMiddleware from '../middleware/validator.js'

const router = new Router({ prefix: '/api/auth' })

router.post(
  '/login',
  validateMiddleware('login', 'body'),
  authController.login.bind(authController)
)

router.post(
  '/logout',
  authMiddleware(),
  authController.logout.bind(authController)
)

router.get(
  '/current',
  authMiddleware(),
  authController.currentUser.bind(authController)
)

router.post(
  '/change-password',
  authMiddleware(),
  authController.changePassword.bind(authController)
)

export default router
