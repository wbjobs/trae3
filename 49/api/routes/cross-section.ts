import { Router, type Request, type Response } from 'express'
import { getDb } from '../database.js'
import { v4 as uuid } from 'uuid'
import type { CrossSectionData, CorrosionLayer, PressurePoint } from '../../shared/types.js'

const router = Router()

router.get('/:id/cross-section', (req: Request, res: Response): void => {
  const db = getDb()
  const row = db.prepare(
    'SELECT id, diameter, material, install_date FROM pipe_segment WHERE id = ?'
  ).get(req.params.id) as Record<string, unknown> | undefined

  if (!row) {
    res.status(404).json({ success: false, error: 'Pipe segment not found' })
    return
  }

  const diameter = row.diameter as number
  const material = row.material as string
  const isSteel = material.toLowerCase().includes('steel') || material.toLowerCase().includes('钢')
  const wallThickness = isSteel
    ? Math.round((12 + (diameter / 500) * 8 + Math.random() * 2) * 10) / 10
    : Math.round((8 + (diameter / 500) * 7 + Math.random() * 2) * 10) / 10

  const installDate = new Date(row.install_date as string)
  const ageYears = (Date.now() - installDate.getTime()) / (365 * 86400000)

  const corrosionLayers: CorrosionLayer[] = []
  const corrosionCount = 2 + Math.floor(Math.random() * 4)
  let maxCorrosionDepth = 0

  for (let i = 0; i < corrosionCount; i++) {
    const depth = Math.random() * wallThickness * 0.5
    const startAngle = Math.round(Math.random() * 360)
    const arcLength = 20 + Math.random() * 60
    const endAngle = Math.round((startAngle + arcLength) % 360)
    maxCorrosionDepth = Math.max(maxCorrosionDepth, depth)
    const severity: CorrosionLayer['severity'] =
      depth > wallThickness * 0.3 ? 'severe' : depth > wallThickness * 0.15 ? 'moderate' : 'mild'
    corrosionLayers.push({
      id: uuid(),
      depth: Math.round(depth * 100) / 100,
      startAngle,
      endAngle,
      severity,
    })
  }

  const pressureDistribution: PressurePoint[] = []
  const basePressure = 0.6 + Math.random() * 0.6
  for (let angle = 0; angle < 360; angle += 22.5) {
    const variation = Math.sin(angle * Math.PI / 180) * 0.08 + (Math.random() - 0.5) * 0.04
    pressureDistribution.push({
      angle: Math.round(angle),
      value: Math.round((basePressure + variation) * 100) / 100,
    })
  }

  const estimatedLife = Math.max(2, Math.round((30 - ageYears * 0.8 - maxCorrosionDepth * 5 + (Math.random() - 0.3) * 8) * 10) / 10)

  let riskLevel: CrossSectionData['riskLevel'] = 'low'
  if (maxCorrosionDepth > wallThickness * 0.3 || estimatedLife < 8) {
    riskLevel = 'high'
  } else if (maxCorrosionDepth > wallThickness * 0.15 || estimatedLife < 18 || ageYears > 15) {
    riskLevel = 'medium'
  }

  const maintenanceRecommendations: string[] = []
  if (riskLevel === 'high') {
    maintenanceRecommendations.push('建议立即进行全面检测评估')
    maintenanceRecommendations.push('考虑制定管道更换或修复计划')
  }
  if (corrosionLayers.some(c => c.severity === 'severe')) {
    maintenanceRecommendations.push('严重腐蚀区域需进行超声波检测评估深度')
  }
  if (ageYears > 10) {
    maintenanceRecommendations.push('管道已使用超过10年，建议增加检测频率')
  }
  if (estimatedLife < 15) {
    maintenanceRecommendations.push('预计剩余寿命不足15年，建议制定中长期更换计划')
  }
  if (maintenanceRecommendations.length === 0) {
    maintenanceRecommendations.push('管道状态良好，继续常规监测')
  }
  maintenanceRecommendations.push('每季度进行一次外观检查')
  maintenanceRecommendations.push('每年进行一次压力测试')

  const data: CrossSectionData = {
    pipeId: row.id as string,
    diameter,
    outerDiameter: Math.round((diameter + wallThickness * 2) * 10) / 10,
    innerDiameter: diameter,
    wallThickness,
    material,
    pressure: basePressure,
    maxPressure: isSteel ? 1.6 : 1.0,
    riskLevel,
    corrosionLayers,
    pressureDistribution,
    estimatedLife,
    maintenanceRecommendations,
  }

  res.json({ success: true, data })
})

export default router
