import { isDBConnected } from '../db.js'
import Detection from '../models/Detection.js'
import FaultClassification from '../models/FaultClassification.js'
import type { DashboardStats } from '../../shared/types.js'

export async function getStats(): Promise<DashboardStats> {
  if (!isDBConnected()) {
    return getMockStats()
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const todayDetections = await Detection.find({
    createdAt: { $gte: today, $lt: tomorrow },
  })
  const todayCount = todayDetections.length

  const todayDetectionIds = todayDetections.map((d) => d._id)
  const todayFaultClassifications = await FaultClassification.find({
    detectionId: { $in: todayDetectionIds },
    faultType: { $ne: 'normal' },
  })
  const todayFaultCount = new Set(todayFaultClassifications.map((c) => String(c.detectionId))).size
  const todayFaultRate = todayCount > 0 ? Math.round((todayFaultCount / todayCount) * 100) : 0

  const criticalAlerts = await FaultClassification.countDocuments({
    severity: 'critical',
    createdAt: { $gte: today },
  })

  const totalCount = await Detection.countDocuments()

  const faultDistribution = await FaultClassification.aggregate([
    { $group: { _id: '$faultType', count: { $sum: 1 } } },
    { $project: { _id: 0, faultType: '$_id', count: 1 } },
  ])

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  const trendData = await Detection.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        total: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ])

  const faultTrendData = await FaultClassification.aggregate([
    { $match: { faultType: { $ne: 'normal' }, createdAt: { $gte: sevenDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        faultCount: { $sum: 1 },
      },
    },
  ])

  const faultTrendMap = new Map(faultTrendData.map((item) => [item._id, item.faultCount]))

  const trend: DashboardStats['trend'] = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    const dayData = trendData.find((d) => d._id === dateStr)
    trend.push({
      date: dateStr,
      total: dayData?.total || 0,
      faultCount: faultTrendMap.get(dateStr) || 0,
    })
  }

  const recentCritical = await FaultClassification.find({ severity: 'critical' })
    .sort({ createdAt: -1 })
    .limit(5)

  const recentCriticalItems = recentCritical.map((c) => ({
    id: String(c._id),
    filename: '',
    faultType: c.faultType,
    severity: c.severity,
    createdAt: c.createdAt.toISOString(),
  }))

  return {
    todayCount,
    todayFaultRate,
    criticalAlerts,
    totalCount,
    faultDistribution,
    trend,
    recentCritical: recentCriticalItems,
  }
}

function getMockStats(): DashboardStats {
  const trend: DashboardStats['trend'] = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    trend.push({
      date: dateStr,
      total: Math.floor(Math.random() * 20) + 5,
      faultCount: Math.floor(Math.random() * 8),
    })
  }

  return {
    todayCount: 12,
    todayFaultRate: 33,
    criticalAlerts: 2,
    totalCount: 156,
    faultDistribution: [
      { faultType: 'overheating', count: 23 },
      { faultType: 'connection_loose', count: 15 },
      { faultType: 'insulation_failure', count: 8 },
      { faultType: 'load_unbalance', count: 11 },
      { faultType: 'normal', count: 45 },
    ],
    trend,
    recentCritical: [
      { id: '1', filename: 'transformer_001.jpg', faultType: 'overheating', severity: 'critical', createdAt: new Date().toISOString() },
      { id: '2', filename: 'panel_switch_003.jpg', faultType: 'connection_loose', severity: 'critical', createdAt: new Date(Date.now() - 3600000).toISOString() },
    ],
  }
}
