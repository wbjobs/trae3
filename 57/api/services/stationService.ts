import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database.js'
import type { Station } from '../../shared/types.js'

export function getStations(): Station[] {
  const db = getDb()

  const stations = db.prepare('SELECT * FROM stations ORDER BY created_at ASC').all() as Array<Record<string, unknown>>

  return stations.map(s => {
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
}

export function createStation(data: {
  name: string
  lat: number
  lng: number
  river: string
  dataFormat: string
}): { success: boolean; stationId: string } {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

  db.prepare(`
    INSERT INTO stations (id, name, lat, lng, river, status, data_format, created_at)
    VALUES (?, ?, ?, ?, ?, 'online', ?, ?)
  `).run(id, data.name, data.lat, data.lng, data.river, data.dataFormat || 'json', now)

  return { success: true, stationId: id }
}

export function getStationById(id: string): Station | null {
  const db = getDb()

  const s = db.prepare('SELECT * FROM stations WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!s) return null

  const lastData = db.prepare(`
    SELECT timestamp, water_level, flow_rate, rainfall, water_temp, ph, dissolved_oxygen
    FROM ts_monitor_data
    WHERE station_id = ?
    ORDER BY timestamp DESC LIMIT 1
  `).get(id) as Record<string, unknown> | undefined

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
}
