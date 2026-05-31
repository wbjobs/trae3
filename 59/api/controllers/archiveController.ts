import { Request, Response } from 'express'
import * as archiveService from '../services/archiveService.js'

export function getArchiveList(req: Request, res: Response) {
  try {
    const tables = archiveService.listArchiveTables()
    const stats = tables.map((table) => ({
      tableName: table,
      ...archiveService.getArchiveTableStats(table),
    }))

    res.json({ success: true, data: stats })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function triggerArchive(req: Request, res: Response) {
  try {
    const { type, days, hours } = req.body

    let result
    if (type === 'alerts') {
      result = archiveService.archiveAlerts(days || 30)
    } else if (type === 'trend') {
      result = archiveService.archiveTrendData(hours || 168)
    } else {
      const alertsResult = archiveService.archiveAlerts(days || 30)
      const trendResult = archiveService.archiveTrendData(hours || 168)
      result = { alerts: alertsResult, trend: trendResult }
    }

    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function exportArchive(req: Request, res: Response) {
  try {
    const { tableName } = req.params
    const { format = 'json', limit } = req.query

    if (!tableName.includes('_archive_')) {
      return res.status(400).json({ success: false, error: 'Invalid archive table name' })
    }

    if (format === 'csv') {
      const csv = archiveService.exportArchiveToCsv(tableName, limit ? Number(limit) : undefined)
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="${tableName}.csv"`)
      res.send(csv)
    } else {
      const data = archiveService.exportArchiveToJson(tableName, limit ? Number(limit) : undefined)
      res.setHeader('Content-Disposition', `attachment; filename="${tableName}.json"`)
      res.json({ success: true, data })
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export function deleteArchive(req: Request, res: Response) {
  try {
    const { tableName } = req.params

    if (!tableName.includes('_archive_')) {
      return res.status(400).json({ success: false, error: 'Invalid archive table name' })
    }

    const success = archiveService.dropArchiveTable(tableName)
    res.json({ success, message: success ? 'Archive deleted' : 'Delete failed' })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}
