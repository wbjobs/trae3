import { Router, type Request, type Response } from 'express'
import * as authService from '../services/authService.js'

const router = Router()

router.post('/login', (req: Request, res: Response): void => {
  const { username, password } = req.body
  if (!username || !password) {
    res.status(400).json({ success: false, error: '用户名和密码不能为空' })
    return
  }
  const result = authService.login(username, password)
  if (!result) {
    res.status(401).json({ success: false, error: '用户名或密码错误' })
    return
  }
  res.json({ success: true, data: result })
})

export default router
