import { Router, type Request, type Response } from 'express'
import { store } from '../db/store.js'

const router = Router()

router.get('/', (_req: Request, res: Response): void => {
  const services = store.getServices()
  res.json({ services })
})

export default router
