import type { PvDataPoint, ForecastPoint, ForecastData } from '../shared/types.js'
import { FORECAST_WINDOW_SIZE } from '../shared/types.js'

export function predictNextPoints(historyPoints: PvDataPoint[], steps: number): ForecastPoint[] {
  if (historyPoints.length === 0) {
    return []
  }

  const n = Math.min(historyPoints.length, FORECAST_WINDOW_SIZE)
  const recentPoints = historyPoints.slice(-n)
  
  const weights = Array.from({ length: n }, (_, i) => i + 1)
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  const lastTimestamp = recentPoints[recentPoints.length - 1].timestamp
  const avgInterval = recentPoints.length > 1
    ? (recentPoints[recentPoints.length - 1].timestamp - recentPoints[0].timestamp) / (recentPoints.length - 1)
    : 2000

  const result: ForecastPoint[] = []

  for (let step = 0; step < steps; step++) {
    let weightedPower = 0
    let weightedIrradiance = 0
    let weightedTemperature = 0

    for (let i = 0; i < n; i++) {
      const weight = weights[i]
      weightedPower += recentPoints[i].power * weight
      weightedIrradiance += recentPoints[i].irradiance * weight
      weightedTemperature += recentPoints[i].temperature * weight
    }

    const forecastPower = weightedPower / totalWeight
    const forecastIrradiance = weightedIrradiance / totalWeight
    const forecastTemperature = weightedTemperature / totalWeight

    result.push({
      timestamp: lastTimestamp + (step + 1) * avgInterval,
      power: Math.round(forecastPower * 100) / 100,
      irradiance: Math.round(forecastIrradiance * 100) / 100,
      temperature: Math.round(forecastTemperature * 100) / 100,
    })

    recentPoints.push({
      ...recentPoints[recentPoints.length - 1],
      timestamp: result[result.length - 1].timestamp,
      power: forecastPower,
      irradiance: forecastIrradiance,
      temperature: forecastTemperature,
    })
    recentPoints.shift()
  }

  return result
}

function calculateConfidence(historyPoints: PvDataPoint[]): number {
  if (historyPoints.length < 2) return 0.5

  const n = Math.min(historyPoints.length, FORECAST_WINDOW_SIZE)
  const recentPoints = historyPoints.slice(-n)

  const meanPower = recentPoints.reduce((s, p) => s + p.power, 0) / n
  const variance = recentPoints.reduce((s, p) => s + Math.pow(p.power - meanPower, 2), 0) / n
  const stdDev = Math.sqrt(variance)

  const normalizedVariance = meanPower > 0 ? stdDev / meanPower : 0
  const confidence = Math.max(0, 1 - normalizedVariance * 2)

  return Math.round(confidence * 100) / 100
}

export function updateForecast(arrayId: string, history: PvDataPoint[]): ForecastData {
  const forecast = predictNextPoints(history, 6)
  const confidence = calculateConfidence(history)

  return {
    arrayId,
    forecast,
    confidence,
  }
}
