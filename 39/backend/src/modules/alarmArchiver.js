import cron from 'node-cron'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class AlarmArchiver {
  constructor(db, options = {}) {
    this.db = db
    this.archiveThreshold = options.archiveThreshold || 24 * 60 * 60 * 1000
    this.archiveDir = options.archiveDir || path.join(__dirname, '../../data/archives')
    this.maxArchiveFiles = options.maxArchiveFiles || 30
    this.isRunning = false
    
    this.initArchiveDir()
  }

  initArchiveDir() {
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true })
    }
  }

  start() {
    if (this.isRunning) return
    
    this.isRunning = true
    
    cron.schedule('0 0 * * *', () => {
      this.archiveOldAlarms()
    })
    
    console.log('📦 告警归档服务已启动')
  }

  stop() {
    this.isRunning = false
  }

  async archiveOldAlarms() {
    const now = Date.now()
    const cutoffTime = now - this.archiveThreshold
    
    const allAlarms = this.db.getAlarms()
    const toArchive = allAlarms.filter(a => a.timestamp < cutoffTime)
    
    if (toArchive.length === 0) {
      console.log('📦 没有需要归档的告警')
      return { archived: 0 }
    }
    
    const dateStr = new Date(cutoffTime).toISOString().split('T')[0]
    const archiveFile = path.join(this.archiveDir, `alarms_${dateStr}.json`)
    
    let existingArchive = []
    if (fs.existsSync(archiveFile)) {
      try {
        existingArchive = JSON.parse(fs.readFileSync(archiveFile, 'utf8'))
      } catch (e) {
        existingArchive = []
      }
    }
    
    const combined = [...existingArchive, ...toArchive]
    fs.writeFileSync(archiveFile, JSON.stringify(combined, null, 2))
    
    toArchive.forEach(alarm => {
      this.db.removeAlarm(alarm.id)
    })
    
    this.cleanupOldArchives()
    
    console.log(`📦 已归档 ${toArchive.length} 条告警到 ${archiveFile}`)
    
    return {
      archived: toArchive.length,
      archiveFile
    }
  }

  queryArchive(date, filters = {}) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0]
    const archiveFile = path.join(this.archiveDir, `alarms_${dateStr}.json`)
    
    if (!fs.existsSync(archiveFile)) {
      return []
    }
    
    try {
      let alarms = JSON.parse(fs.readFileSync(archiveFile, 'utf8'))
      
      if (filters.deviceId) {
        alarms = alarms.filter(a => a.deviceId === filters.deviceId)
      }
      if (filters.level) {
        alarms = alarms.filter(a => a.level === filters.level)
      }
      if (filters.acknowledged !== undefined) {
        alarms = alarms.filter(a => a.acknowledged === filters.acknowledged)
      }
      
      return alarms
    } catch (e) {
      console.error('查询归档告警失败:', e)
      return []
    }
  }

  getArchiveDates() {
    if (!fs.existsSync(this.archiveDir)) {
      return []
    }
    
    const files = fs.readdirSync(this.archiveDir)
      .filter(f => f.startsWith('alarms_') && f.endsWith('.json'))
      .map(f => f.replace('alarms_', '').replace('.json', ''))
      .sort()
      .reverse()
    
    return files
  }

  getArchiveStats() {
    const dates = this.getArchiveDates()
    const stats = dates.map(date => {
      const file = path.join(this.archiveDir, `alarms_${date}.json`)
      const size = fs.statSync(file).size
      let count = 0
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        count = data.length
      } catch (e) {}
      
      return {
        date,
        count,
        size: (size / 1024).toFixed(2) + ' KB'
      }
    })
    
    return {
      archives: stats,
      totalSize: this.getTotalArchiveSize()
    }
  }

  getTotalArchiveSize() {
    if (!fs.existsSync(this.archiveDir)) return '0 KB'
    
    let total = 0
    const files = fs.readdirSync(this.archiveDir)
    
    files.forEach(f => {
      const filePath = path.join(this.archiveDir, f)
      total += fs.statSync(filePath).size
    })
    
    if (total > 1024 * 1024) {
      return (total / 1024 / 1024).toFixed(2) + ' MB'
    }
    return (total / 1024).toFixed(2) + ' KB'
  }

  cleanupOldArchives() {
    const dates = this.getArchiveDates()
    
    if (dates.length > this.maxArchiveFiles) {
      const toDelete = dates.slice(this.maxArchiveFiles)
      
      toDelete.forEach(date => {
        const file = path.join(this.archiveDir, `alarms_${date}.json`)
        try {
          fs.unlinkSync(file)
          console.log(`🗑️  删除旧归档: ${date}`)
        } catch (e) {
          console.error(`删除归档失败 ${date}:`, e)
        }
      })
    }
  }

  deleteArchive(date) {
    const file = path.join(this.archiveDir, `alarms_${date}.json`)
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
      return true
    }
    return false
  }

  manualArchive(hours = 24) {
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000
    
    const allAlarms = this.db.getAlarms()
    const toArchive = allAlarms.filter(a => a.timestamp < cutoffTime)
    
    if (toArchive.length === 0) {
      return { archived: 0, message: '没有需要归档的告警' }
    }
    
    return this.archiveOldAlarms()
  }
}

export default AlarmArchiver
