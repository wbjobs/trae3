import deviceService from './deviceService.js'
import alertService from './alertService.js'
import { broadcastToClients, getConnectedClientCount } from '../websocket.js'
import type { Device, DeviceParam, Alert } from '../../shared/types.js'

let isRunning = false
let isPolling = false
let intervalId: ReturnType<typeof setInterval> | null = null
let lastPollTime = 0
const MIN_POLL_INTERVAL = 4000

type DeviceUpdateCallback = (updates: { device: Device; params: DeviceParam[] }[]) => void
type AlertCallback = (alerts: Alert[]) => void

function broadcastDeviceUpdates(updates: { device: Device; params: DeviceParam[] }[]) {
  if (updates.length === 0) return

  const changedUpdates = updates.filter(({ device, params }) => {
    const changedParams = params.filter((p) => p.changed)
    return device.status !== 'offline' || changedParams.length > 0
  })

  if (changedUpdates.length === 0) return

  broadcastToClients({
    type: 'device_updates',
    payload: changedUpdates.map(({ device, params }) => ({
      id: device.id,
      status: device.status,
      healthScore: device.healthScore,
      params: params.filter((p) => p.changed).map((p) => ({
        key: p.key,
        value: p.value,
        unit: p.unit,
      })),
    })),
    timestamp: Date.now(),
  })
}

function broadcastAlerts(alerts: Alert[]) {
  if (alerts.length === 0) return

  alerts.forEach((alert) => {
    broadcastToClients({
      type: 'alert',
      payload: alert,
      timestamp: Date.now(),
    })
  })
}

async function doPoll(onDeviceUpdate: DeviceUpdateCallback, onAlert: AlertCallback) {
  if (isPolling) return

  const now = Date.now()
  if (now - lastPollTime < MIN_POLL_INTERVAL) return

  isPolling = true
  lastPollTime = now

  try {
    const clientCount = getConnectedClientCount()
    if (clientCount === 0) {
      isPolling = false
      return
    }

    const updates = await deviceService.simulateDataUpdate()
    onDeviceUpdate(updates)
    broadcastDeviceUpdates(updates)

    const newAlerts = await alertService.checkAlerts()
    if (newAlerts.length > 0) {
      onAlert(newAlerts)
      broadcastAlerts(newAlerts)
    }
  } catch (err) {
    console.error('[Gateway] Polling error:', err instanceof Error ? err.message : 'Unknown')
  } finally {
    isPolling = false
  }
}

function startPolling(
  intervalMs: number = 5000,
  onDeviceUpdate: DeviceUpdateCallback,
  onAlert: AlertCallback,
): () => void {
  stopPolling()

  if (intervalMs < MIN_POLL_INTERVAL) {
    intervalMs = MIN_POLL_INTERVAL
  }

  isRunning = true

  doPoll(onDeviceUpdate, onAlert)

  intervalId = setInterval(() => {
    if (isRunning) {
      doPoll(onDeviceUpdate, onAlert)
    }
  }, intervalMs)

  return stopPolling
}

function stopPolling(): void {
  isRunning = false
  isPolling = false
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function getStatus() {
  return {
    isRunning,
    isPolling,
    lastPollTime,
    connectedClients: getConnectedClientCount(),
  }
}

export default {
  startPolling,
  stopPolling,
  getStatus,
}
