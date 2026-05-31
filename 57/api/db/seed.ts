import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database.js'
import { hotDataStore } from '../services/hotDataCache.js'

const STATIONS = [
  { name: '长江上游站', lat: 29.56, lng: 106.55, river: '长江' },
  { name: '嘉陵江中游站', lat: 29.83, lng: 106.44, river: '嘉陵江' },
  { name: '涪江下游站', lat: 29.72, lng: 105.57, river: '涪江' },
  { name: '渠江站', lat: 30.33, lng: 106.94, river: '渠江' },
  { name: '乌江站', lat: 29.30, lng: 108.16, river: '乌江' },
  { name: '长江下游站', lat: 29.72, lng: 107.75, river: '长江' },
]

const ALERT_RULES_TEMPLATES = [
  { metric: 'waterLevel', level: 'blue' as const, threshold: 20, operator: 'gt' },
  { metric: 'waterLevel', level: 'yellow' as const, threshold: 25, operator: 'gt' },
  { metric: 'waterLevel', level: 'orange' as const, threshold: 30, operator: 'gt' },
  { metric: 'waterLevel', level: 'red' as const, threshold: 33, operator: 'gt' },
  { metric: 'flowRate', level: 'blue' as const, threshold: 8000, operator: 'gt' },
  { metric: 'flowRate', level: 'yellow' as const, threshold: 10000, operator: 'gt' },
  { metric: 'rainfall', level: 'blue' as const, threshold: 25, operator: 'gt' },
  { metric: 'rainfall', level: 'yellow' as const, threshold: 40, operator: 'gt' },
  { metric: 'ph', level: 'blue' as const, threshold: 6.5, operator: 'lt' },
]

function generateHourlyData(stationId: string, now: Date): Array<{
  id: string
  station_id: string
  timestamp: string
  water_level: number | null
  flow_rate: number | null
  rainfall: number | null
  water_temp: number | null
  ph: number | null
  dissolved_oxygen: number | null
}> {
  const records = []
  const hours = 7 * 24

  const baseWaterLevel = 15 + Math.random() * 5
  const baseFlowRate = 2000 + Math.random() * 3000

  const rainStartHour = 48 + Math.floor(Math.random() * 24)
  const rainDuration = 12 + Math.floor(Math.random() * 12)
  const rainIntensity = 0.3 + Math.random() * 0.7

  for (let h = 0; h < hours; h++) {
    const ts = new Date(now.getTime() - (hours - h) * 3600_000)
    const timestamp = ts.toISOString().replace('T', ' ').substring(0, 19)

    const isRaining = h >= rainStartHour && h < rainStartHour + rainDuration
    const rainLag = h - (rainStartHour + rainDuration)
    const isAfterRain = rainLag > 0 && rainLag < 18

    const hourOfDay = ts.getHours()

    let rainfall = 0
    if (isRaining) {
      const rainProgress = (h - rainStartHour) / rainDuration
      const bellCurve = Math.sin(rainProgress * Math.PI)
      rainfall = bellCurve * rainIntensity * 40 + Math.random() * 5
    } else if (Math.random() < 0.05) {
      rainfall = Math.random() * 3
    }

    let waterLevel = baseWaterLevel
    if (isAfterRain) {
      const riseFactor = Math.exp(-rainLag / 8) * rainIntensity * 10
      waterLevel += riseFactor
    }
    waterLevel += Math.sin(h / 24 * Math.PI) * 0.5
    waterLevel += (Math.random() - 0.5) * 0.3

    let flowRate = baseFlowRate
    if (isAfterRain) {
      flowRate += Math.exp(-rainLag / 6) * rainIntensity * 5000
    }
    flowRate += (waterLevel - baseWaterLevel) * 500
    flowRate += (Math.random() - 0.5) * 200

    const waterTemp = 20 + Math.sin((hourOfDay - 6) / 24 * 2 * Math.PI) * 3 + (Math.random() - 0.5) * 0.5
    const ph = 7.2 + Math.sin(h / 72 * Math.PI) * 0.5 + (Math.random() - 0.5) * 0.2
    const dissolvedOxygen = 7.5 + Math.sin((hourOfDay - 14) / 24 * 2 * Math.PI) * 1.5 + (Math.random() - 0.5) * 0.3

    records.push({
      id: uuidv4(),
      station_id: stationId,
      timestamp,
      water_level: Math.round(waterLevel * 100) / 100,
      flow_rate: Math.round(Math.max(flowRate, 100) * 100) / 100,
      rainfall: Math.round(Math.max(rainfall, 0) * 100) / 100,
      water_temp: Math.round(waterTemp * 100) / 100,
      ph: Math.round(ph * 100) / 100,
      dissolved_oxygen: Math.round(dissolvedOxygen * 100) / 100,
    })
  }

  return records
}

export function seedDatabase(): void {
  const db = getDb()

  const existing = db.prepare('SELECT COUNT(*) as count FROM stations').get() as { count: number }
  if (existing.count > 0) {
    return
  }

  const insertStation = db.prepare(`
    INSERT INTO stations (id, name, lat, lng, river, status, data_format, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMonitorData = db.prepare(`
    INSERT INTO ts_monitor_data (id, station_id, timestamp, water_level, flow_rate, rainfall, water_temp, ph, dissolved_oxygen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertAlertRule = db.prepare(`
    INSERT INTO alert_rules (id, station_id, metric, level, threshold, operator, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const insertAlert = db.prepare(`
    INSERT INTO alerts (id, station_id, rule_id, level, metric, value, threshold, message, status, timestamp, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertIndicatorResult = db.prepare(`
    INSERT INTO indicator_results (id, station_id, indicator_type, value, unit, start_time, end_time, calculated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const stationIds: string[] = []
  const now = new Date()

  const seedTransaction = db.transaction(() => {
    for (const s of STATIONS) {
      const id = uuidv4()
      stationIds.push(id)
      insertStation.run(id, s.name, s.lat, s.lng, s.river, 'online', 'json', now.toISOString().replace('T', ' ').substring(0, 19))
    }

    for (const stationId of stationIds) {
      const records = generateHourlyData(stationId, now)
      for (const r of records) {
        insertMonitorData.run(r.id, r.station_id, r.timestamp, r.water_level, r.flow_rate, r.rainfall, r.water_temp, r.ph, r.dissolved_oxygen)
      }
    }

    const ruleIds: string[] = []
    for (const stationId of stationIds) {
      for (const rule of ALERT_RULES_TEMPLATES) {
        const ruleId = uuidv4()
        ruleIds.push(ruleId)
        insertAlertRule.run(ruleId, stationId, rule.metric, rule.level, rule.threshold, rule.operator, 1)
      }
    }

    const levels = ['blue', 'yellow', 'orange', 'red'] as const
    const metrics = ['waterLevel', 'flowRate', 'rainfall'] as const
    const metricLabels: Record<string, string> = { waterLevel: '水位', flowRate: '流量', rainfall: '降雨量' }
    const metricUnits: Record<string, string> = { waterLevel: 'm', flowRate: 'm³/s', rainfall: 'mm' }

    for (let i = 0; i < stationIds.length; i++) {
      const stationId = stationIds[i]
      const stationName = STATIONS[i].name
      const alertCount = 2 + Math.floor(Math.random() * 3)

      for (let a = 0; a < alertCount; a++) {
        const metric = metrics[Math.floor(Math.random() * metrics.length)]
        const level = levels[Math.floor(Math.random() * levels.length)]
        const ruleIdx = i * ALERT_RULES_TEMPLATES.length + ALERT_RULES_TEMPLATES.findIndex(r => r.metric === metric && r.level === level)
        const ruleId = ruleIdx >= 0 && ruleIdx < ruleIds.length ? ruleIds[ruleIdx] : ruleIds[0]

        const threshold = ALERT_RULES_TEMPLATES.find(r => r.metric === metric && r.level === level)?.threshold ?? 25
        const value = threshold + Math.random() * threshold * 0.2

        const alertTime = new Date(now.getTime() - Math.random() * 7 * 24 * 3600_000)

        insertAlert.run(
          uuidv4(),
          stationId,
          ruleId,
          level,
          metric,
          Math.round(value * 100) / 100,
          threshold,
          `${stationName} ${metricLabels[metric]}${metricUnits[metric]}超限，当前值${Math.round(value * 100) / 100}${metricUnits[metric]}，阈值${threshold}${metricUnits[metric]}`,
          Math.random() > 0.5 ? 'active' : (Math.random() > 0.5 ? 'confirmed' : 'ignored'),
          alertTime.toISOString().replace('T', ' ').substring(0, 19),
          Math.random() > 0.7 ? '已安排巡查' : null,
        )
      }
    }

    const indicatorTypes = [
      { type: 'riseRate', unit: 'm/h', minVal: 0.1, maxVal: 2.0 },
      { type: 'peakFlow', unit: 'm³/s', minVal: 5000, maxVal: 15000 },
      { type: 'runoffCoeff', unit: '', minVal: 0.2, maxVal: 0.8 },
      { type: 'rainfallIntensity', unit: 'mm/h', minVal: 10, maxVal: 50 },
      { type: 'returnPeriod', unit: '年', minVal: 5, maxVal: 100 },
    ] as const

    for (const stationId of stationIds) {
      for (const ind of indicatorTypes) {
        const value = ind.minVal + Math.random() * (ind.maxVal - ind.minVal)
        const endTime = new Date(now.getTime() - Math.random() * 24 * 3600_000)
        const startTime = new Date(endTime.getTime() - 24 * 3600_000)

        insertIndicatorResult.run(
          uuidv4(),
          stationId,
          ind.type,
          Math.round(value * 100) / 100,
          ind.unit,
          startTime.toISOString().replace('T', ' ').substring(0, 19),
          endTime.toISOString().replace('T', ' ').substring(0, 19),
          now.toISOString().replace('T', ' ').substring(0, 19),
        )
      }
    }
  })

  seedTransaction()

  const cutoff24h = new Date(now.getTime() - 24 * 3600 * 1000)
  const cutoffStr = cutoff24h.toISOString().replace('T', ' ').substring(0, 19)

  for (const sid of stationIds) {
    const recentRows = db.prepare(`
      SELECT timestamp, water_level, flow_rate, rainfall, water_temp, ph, dissolved_oxygen
      FROM ts_monitor_data
      WHERE station_id = ? AND timestamp >= ?
      ORDER BY timestamp ASC
    `).all(sid, cutoffStr) as Array<{
      timestamp: string
      water_level: number | null
      flow_rate: number | null
      rainfall: number | null
      water_temp: number | null
      ph: number | null
      dissolved_oxygen: number | null
    }>

    for (const r of recentRows) {
      hotDataStore.add(sid, r.timestamp, {
        waterLevel: r.water_level,
        flowRate: r.flow_rate,
        rainfall: r.rainfall,
        waterTemp: r.water_temp,
        ph: r.ph,
        dissolvedOxygen: r.dissolved_oxygen,
      })
    }
  }

  console.log('Database seeded successfully with 6 stations, 7 days of hourly data, alert rules, alerts, and indicator results.')
}
