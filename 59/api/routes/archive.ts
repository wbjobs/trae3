import { Router } from 'express'
import { getArchiveList, triggerArchive, exportArchive, deleteArchive } from '../controllers/archiveController.js'

const router = Router()

router.get('/list', getArchiveList)
router.post('/trigger', triggerArchive)
router.get('/export/:tableName', exportArchive)
router.delete('/:tableName', deleteArchive)

export default router
