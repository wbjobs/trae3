import * as deviceRepo from '../repositories/deviceRepository.js'
import * as alertRepo from '../repositories/alertRepository.js'
import * as archiveService from './archiveService.js'

const TREND_DATA_ARCHIVE_HOURS = 168
const RESOLVED_ALERTS_ARCHIVE_DAYS = 30
const ARCHIVE_INTERVAL_MS = 3600000

let cleanupTimer: ReturnType<typeof setInterval> | null = null
let isCleaning = false

async function doCleanup() {
  if (isCleaning) return
  isCleaning = true

  try {
    const trendArchive = archiveService.archiveTrendData(TREND_DATA_ARCHIVE_HOURS)
    const alertsArchive = archiveService.archiveAlerts(RESOLVED_ALERTS_ARCHIVE_DAYS)

    if (trendArchive.archivedRecords > 0 || alertsArchive.archivedRecords > 0) {
      console.log(
        `[Archive] Archived ${trendArchive.archivedRecords} trend records, ${alertsArchive.archivedRecords} resolved alerts`,
      )
    }

    const deletedTrend = deviceRepo.deleteOldTrendData(TREND_DATA_ARCHIVE_HOURS + 24)
    if (deletedTrend > 0) {
      console.log(`[Cleanup] Deleted ${deletedTrend} expired trend records`)
    }

    const trendCount = deviceRepo.getTrendDataCount()
    const alertsCount = alertRepo.getAlertsCount()
    const archiveTables = archiveService.listArchiveTables()
    console.log(
      `[Cleanup] Stats: ${trendCount} trend records, ${alertsCount.total} alerts (${alertsCount.active} active, ${alertsCount.resolved} resolved), ${archiveTables.length} archives`,
    )
  } catch (err) {
    console.error('[Cleanup] Error:', err instanceof Error ? err.message : 'Unknown')
  } finally {
    isCleaning = false
  }
}

function startCleanup() {
  if (cleanupTimer) return

  setTimeout(() => doCleanup(), 10000)

  cleanupTimer = setInterval(() => {
    doCleanup()
  }, ARCHIVE_INTERVAL_MS)

  console.log('[Cleanup] Service started (archive + cleanup)')
}

function stopCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
    console.log('[Cleanup] Service stopped')
  }
}

function getStatus() {
  return {
    isRunning: cleanupTimer !== null,
    isCleaning,
    config: {
      trendArchiveHours: TREND_DATA_ARCHIVE_HOURS,
      alertsArchiveDays: RESOLVED_ALERTS_ARCHIVE_DAYS,
      intervalMs: ARCHIVE_INTERVAL_MS,
    },
  }
}

export default {
  startCleanup,
  stopCleanup,
  doCleanup,
  getStatus,
}
