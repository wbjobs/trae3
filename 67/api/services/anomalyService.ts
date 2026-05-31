import { store } from '../db/store.js'
import type { AnomalyQuery, AnomalyRecord, AnomalyDetail, AnomalyEvent, MetricSeries, MetricType } from '../../shared/types.js'

export function queryAnomalies(query: AnomalyQuery): { anomalies: AnomalyRecord[]; total: number } {
  return store.queryAnomalies({
    severity: query.severity,
    metricType: query.metricType,
    serviceName: query.serviceName,
    startTime: query.startTime,
    endTime: query.endTime,
    limit: query.limit,
    offset: query.offset,
  })
}

export function getAnomalyDetail(id: string): AnomalyDetail | null {
  const anomaly = store.getAnomalyById(id)
  if (!anomaly) return null

  const timeline = buildTimeline(anomaly)

  const relatedSeries = buildRelatedSeries(anomaly)

  return { ...anomaly, timeline, relatedSeries }
}

function buildTimeline(anomaly: AnomalyRecord): AnomalyEvent[] {
  const events: AnomalyEvent[] = []

  events.push({
    timestamp: anomaly.detectedAt,
    event: `${anomaly.metricType} usage exceeded threshold on ${anomaly.nodeId}`,
    type: 'trigger',
  })

  if (anomaly.severity === 'critical') {
    events.push({
      timestamp: anomaly.detectedAt,
      event: `Severity escalated to critical`,
      type: 'escalate',
    })
  }

  if (anomaly.recoveredAt) {
    events.push({
      timestamp: anomaly.recoveredAt,
      event: `${anomaly.metricType} usage returned to normal on ${anomaly.nodeId}`,
      type: 'resolve',
    })
  }

  return events
}

function buildRelatedSeries(anomaly: AnomalyRecord): MetricSeries[] {
  const detectedAt = new Date(anomaly.detectedAt)
  const start = new Date(detectedAt.getTime() - 30 * 60 * 1000).toISOString()
  const end = (anomaly.recoveredAt || new Date().toISOString())

  const relatedTypes = anomaly.relatedMetrics.length > 0 ? anomaly.relatedMetrics : [anomaly.metricType]
  const series: MetricSeries[] = []

  for (const mt of relatedTypes) {
    const rows = store.getMetricRowsForRange(mt as MetricType, anomaly.serviceName, anomaly.nodeId, start, end)
    if (rows.length > 0) {
      series.push({
        metricType: mt as MetricType,
        serviceName: anomaly.serviceName,
        nodeId: anomaly.nodeId,
        data: rows.map(r => ({ timestamp: r.timestamp, value: r.value })),
      })
    }
  }

  return series
}
