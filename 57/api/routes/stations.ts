import { Router, type Request, type Response } from 'express'
import { getStations, createStation, getStationById } from '../services/stationService.js'

const router = Router()

router.get('/', (req: Request, res: Response): void => {
  try {
    const stations = getStations()
    res.json({ success: true, stations })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

router.post('/', (req: Request, res: Response): void => {
  try {
    const { name, lat, lng, river, dataFormat } = req.body as {
      name: string
      lat: number
      lng: number
      river: string
      dataFormat: string
    }
    if (!name || lat === undefined || lng === undefined || !river) {
      res.status(400).json({ success: false, error: '缺少必要参数: name, lat, lng, river' })
      return
    }
    const result = createStation({ name, lat, lng, river, dataFormat: dataFormat || 'json' })
    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

router.get('/:id', (req: Request, res: Response): void => {
  try {
    const station = getStationById(req.params.id)
    if (!station) {
      res.status(404).json({ success: false, error: '站点不存在' })
      return
    }
    res.json({ success: true, station })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

export default router
