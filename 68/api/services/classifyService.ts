import type { FaultType, Severity } from '../../shared/types.js'
import type { InferenceRegion } from './inferenceService.js'

export interface ClassifyResult {
  faultType: FaultType
  severity: Severity
  confidence: number
  description: string
  suggestion: string
}

const descriptions: Record<FaultType, string[]> = {
  overheating: [
    '检测到设备表面温度异常升高，存在过热风险',
    '热成像显示局部温度显著高于正常范围',
    '设备运行温度超出安全阈值，疑似过热故障',
  ],
  connection_loose: [
    '检测到连接部位温度分布异常，疑似连接松动',
    '接线端子热像图显示接触不良特征',
    '电气连接处出现异常热斑，可能存在松动',
  ],
  insulation_failure: [
    '检测到绝缘层温度异常，疑似绝缘劣化',
    '热成像显示绝缘区域存在局部放电特征',
    '绝缘材料表面温度分布不均，可能存在绝缘故障',
  ],
  load_unbalance: [
    '检测到三相负载电流不平衡，温差显著',
    '各相温度差异明显，存在负载不平衡',
    '热像图显示相位间温度偏差过大',
  ],
  normal: [
    '设备温度分布正常，未检测到异常',
    '热成像结果在正常范围内',
    '设备运行状态良好，温度分布均匀',
  ],
}

const suggestions: Record<FaultType, string[]> = {
  overheating: [
    '建议立即检查冷却系统是否正常运行，排查散热障碍',
    '建议降低负载运行，安排停机检修散热系统',
    '建议紧急检查设备通风状况，必要时停机处理',
  ],
  connection_loose: [
    '建议尽快停机检查并紧固连接部位',
    '建议对接线端子进行扭矩检测和紧固处理',
    '建议安排检修，重新压接或更换连接件',
  ],
  insulation_failure: [
    '建议尽快安排绝缘检测和老化评估',
    '建议对绝缘材料进行耐压测试，必要时更换',
    '建议停机进行绝缘状态全面检查',
  ],
  load_unbalance: [
    '建议检查三相负载分配，调整负荷平衡',
    '建议排查单相过载原因，优化负载分配',
    '建议对配电系统进行负载均衡调整',
  ],
  normal: [
    '设备运行正常，建议继续定期巡检',
    '无需处理，建议保持当前运行状态',
    '状态良好，建议按计划进行例行维护',
  ],
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function classifyByConfidence(confidence: number): { faultType: FaultType; severity: Severity } {
  if (confidence >= 0.9) {
    const faultType = pickRandom<FaultType>(['overheating', 'connection_loose', 'insulation_failure', 'load_unbalance'])
    const severity = pickRandom<Severity>(['high', 'critical'])
    return { faultType, severity }
  }
  if (confidence >= 0.75) {
    const faultType = pickRandom<FaultType>(['overheating', 'connection_loose', 'insulation_failure', 'load_unbalance'])
    const severity = pickRandom<Severity>(['medium', 'high'])
    return { faultType, severity }
  }
  if (confidence >= 0.6) {
    const faultType = pickRandom<FaultType>(['overheating', 'connection_loose', 'load_unbalance', 'normal'])
    const severity: Severity = faultType === 'normal' ? 'low' : pickRandom(['low', 'medium'])
    return { faultType, severity }
  }
  return { faultType: 'normal', severity: 'low' }
}

export function classifyRegions(regions: InferenceRegion[]): Promise<ClassifyResult[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const results: ClassifyResult[] = regions.map((region) => {
        const { faultType, severity } = classifyByConfidence(region.confidence)
        return {
          faultType,
          severity,
          confidence: region.confidence,
          description: pickRandom(descriptions[faultType]),
          suggestion: pickRandom(suggestions[faultType]),
        }
      })
      resolve(results)
    }, 100)
  })
}
