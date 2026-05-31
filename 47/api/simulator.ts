import type { PvDataPoint } from '../shared/types.js'
import { ARRAY_CONFIGS } from '../shared/types.js'

const arrayConfigMap = new Map(ARRAY_CONFIGS.map((c) => [c.arrayId, c]))

function computeSolarFactor(hour: number): number {
  if (hour < 5.5 || hour > 18.5) return 0
  const peak = 12
  const sigma = 3
  return Math.exp(-0.5 * Math.pow((hour - peak) / sigma, 2))
}

function addNoise(value: number, percent: number): number {
  return value * (1 + (Math.random() - 0.5) * 2 * percent)
}

export function generateDataPoint(arrayId: string, timestamp: number): PvDataPoint {
  const config = arrayConfigMap.get(arrayId)
  const ratedPower = config?.ratedPower ?? 500

  const date = new Date(timestamp)
  const hour = date.getHours() + date.getMinutes() / 60
  const solarFactor = computeSolarFactor(hour)

  const isAnomaly = Math.random() < 0.02
  const anomalyFactor = isAnomaly ? 0.3 + Math.random() * 0.4 : 1

  const basePower = ratedPower * solarFactor * anomalyFactor
  const power = Math.max(0, addNoise(basePower, 0.05))

  const baseIrradiance = 1000 * solarFactor
  const irradiance = Math.max(0, addNoise(baseIrradiance, 0.05))

  const baseTemp = 20 + 25 * solarFactor
  const temperature = addNoise(baseTemp, 0.05)

  let efficiency: number
  if (isAnomaly) {
    efficiency = addNoise(12 + Math.random() * 4, 0.05)
  } else {
    efficiency = addNoise(18 + Math.random() * 4, 0.05)
  }

  const baseVoltage = 500 + 300 * solarFactor
  const voltage = Math.max(0, addNoise(baseVoltage, 0.05))

  const current = voltage > 0 ? power / voltage : 0

  return {
    timestamp,
    arrayId,
    power: Math.round(power * 100) / 100,
    voltage: Math.round(voltage * 100) / 100,
    current: Math.round(current * 100) / 100,
    temperature: Math.round(temperature * 100) / 100,
    irradiance: Math.round(irradiance * 100) / 100,
    efficiency: Math.round(efficiency * 100) / 100,
  }
}
