import { Router, type Request, type Response } from 'express'
import { coldStorage } from '../db/coldStorage.js'
import { store } from '../db/store.js'

const router = Router()

router.get('/tier-stats', (_req: Request, res: Response): void => {
  const coldStats = coldStorage.getTierStats()
  const hotStats = store.getTierStats()
  const allStats = [hotStats, ...coldStats]
  res.json({ tiers: allStats })
})

router.get('/archives', (_req: Request, res: Response): void => {
  const archives = coldStorage.getArchives()
  res.json({ archives })
})

router.post('/archive/:archiveId/restore', (req: Request, res: Response): void => {
  const archiveId = req.params.archiveId
  const restored = coldStorage.restoreFromArchive(archiveId)
  res.json({ restored })
})

router.post('/rotate', (_req: Request, res: Response): void => {
  const movedToCold = store.rotateToCold()
  const movedToArchive = coldStorage.moveToArchive()
  res.json({ movedToCold, movedToArchive })
})

export default router
