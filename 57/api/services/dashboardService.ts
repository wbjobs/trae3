import { getDb } from '../db/database.js'
import type { DashboardOverview, Alert, Station } from '../../shared/types.js'

export function getOverview(): DashboardOverview {
  const db = getDb()

  const totalStations = (db.prepare('SELECT COUNT(*) as count FROM stations').get() as { count: number }).count
  const onlineStations = (db.prepare("SELECT COUNT(*) as count FROM stations WHERE status = 'online'").get() as { count: number }).count
  const activeAlerts = (db.prepare("SELECT COUNT(*) as count FROM alerts WHERE status = 'active'").get() as { count: number }).count

  const avgRow = db.prepare('SELECT AVG(water_level) as avg_wl FROM ts_monitor_data WHERE water_level IS NOT NULL').get() as { avg_wl: number | null }
  const avgWaterLevel = avgRow?.avg_wl ? Math.round(avgRow.avg_wl * 100) / 100 : 0

  const alertRows = db.prepare(`
    SELECT a.*, s.name as station_name
    FROM alerts a
    LEFT JOIN stations s ON a.station_id = s.id
    ORDER BY a.timestamp DESC
    LIMIT 10
  `).all() as Array<Record<string, unknown>>

  const latestAlerts: Alert[] = alertRows.map(row => ({
    id: row.id as string,
    stationId: row.station_id as string,
    stationName: (row.station_name as string) || '未知站点',
    ruleId: row.rule_id as string,
    level: row.level as Alert['level'],
    metric: row.metric as string,
    value: row.value as number,
    threshold: row.threshold as number,
    message: row.message as string,
    status: row.status as Alert['status'],
    timestamp: row.timestamp as string,
    comment: row.comment as string | undefined,
  }))

  const stations = db.prepare('SELECT * FROM stations ORDER BY created_at ASC').all() as Array<Record<string, unknown>>

  const stationStatuses: Station[] = stations.map(s => {
    const lastData = db.prepare(`
      SELECT timestamp, water_level, flow_rate, rainfall, water_temp, ph, dissolved_oxygen
      FROM ts_monitor_data
      WHERE station_id = ?
      ORDER BY timestamp DESC LIMIT 1
    `).get(s.id) as Record<string, unknown> | undefined

    const latestValues: Record<string, number> = {}
    if (lastData) {
      if (lastData.water_level != null) latestValues.waterLevel = lastData.water_level as number
      if (lastData.flow_rate != null) latestValues.flowRate = lastData.flow_rate as number
      if (lastData.rainfall != null) latestValues.rainfall = lastData.rainfall as number
      if (lastData.water_temp != null) latestValues.waterTemp = lastData.water_temp as number
      if (lastData.ph != null) latestValues.ph = lastData.ph as number
      if (lastData.dissolved_oxygen != null) latestValues.dissolvedOxygen = lastData.dissolved_oxygen as number
    }

    return {
      id: s.id as string,
      name: s.name as string,
      lat: s.lat as number,
      lng: s.lng as number,
      river: s.river as string,
      status: s.status as Station['status'],
      dataFormat: s.data_format as string,
      createdAt: s.created_at as string,
      lastReportTime: lastData?.timestamp as string | undefined,
      latestValues: Object.keys(latestValues).length > 0 ? latestValues : undefined,
      metrics: ['waterLevel', 'flowRate', 'rainfall', 'waterTemp', 'ph', 'dissolvedOxygen'],
    }
  })

  return {
    summary: {
      totalStations,
      onlineStations,
      activeAlerts,
      avgWaterLevel,
    },
    latestAlerts,
    stationStatuses,
  }
}
