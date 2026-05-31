import { defineStore } from 'pinia'
import { ref, shallowRef, computed, triggerRef, nextTick } from 'vue'
import type { 
  Cabin, Sensor, SensorData, Device, AlarmLog, SystemStats, 
  DeviceControlCommand, LinkageRule 
} from '../types'

export const useMonitorStore = defineStore('monitor', () => {
  const cabins = ref<Cabin[]>([])
  const sensors = ref<Sensor[]>([])
  const devices = ref<Device[]>([])
  const sensorData = shallowRef<Map<string, SensorData>>(new Map())
  const pendingAlarms = ref<AlarmLog[]>([])
  const systemStats = ref<SystemStats | null>(null)
  const selectedCabinId = ref<string | null>(null)
  const isConnected = ref(false)
  const linkageRules = ref<LinkageRule[]>([])

  let pendingSensorUpdates: Map<string, SensorData> | null = null
  let rafId: number | null = null

  const selectedCabin = computed(() => {
    return cabins.value.find(c => c.id === selectedCabinId.value) || null
  })

  const cabinSensors = computed(() => {
    if (!selectedCabinId.value) return sensors.value
    return sensors.value.filter(s => s.cabinId === selectedCabinId.value)
  })

  const cabinDevices = computed(() => {
    if (!selectedCabinId.value) return devices.value
    return devices.value.filter(d => d.cabinId === selectedCabinId.value)
  })

  const cabinSensorData = computed(() => {
    if (!selectedCabinId.value) return Array.from(sensorData.value.values())
    return Array.from(sensorData.value.values()).filter(
      d => d.cabinId === selectedCabinId.value
    )
  })

  const activeAlarmCount = computed(() => {
    return pendingAlarms.value.filter(a => a.status === 'pending').length
  })

  const criticalAlarmCount = computed(() => {
    return pendingAlarms.value.filter(a => a.level === 'critical').length
  })

  const activeDeviceCount = computed(() => {
    return devices.value.filter(d => d.status === 'on').length
  })

  const getSensorData = (sensorId: string): SensorData | null => {
    return sensorData.value.get(sensorId) || null
  }

  const getSensorValue = (sensorId: string): number => {
    return sensorData.value.get(sensorId)?.value || 0
  }

  const setCabins = (data: Cabin[]) => {
    cabins.value = data
  }

  const setSensors = (data: Sensor[]) => {
    sensors.value = data
  }

  const setDevices = (data: Device[]) => {
    devices.value = data
  }

  const setLinkageRules = (data: LinkageRule[]) => {
    linkageRules.value = data
  }

  const flushSensorUpdates = () => {
    rafId = null
    if (!pendingSensorUpdates || pendingSensorUpdates.size === 0) return

    const currentMap = sensorData.value
    pendingSensorUpdates.forEach((data, key) => {
      currentMap.set(key, data)
    })
    pendingSensorUpdates = null
    triggerRef(sensorData)
  }

  const scheduleSensorFlush = () => {
    if (rafId !== null) return
    rafId = requestAnimationFrame(flushSensorUpdates)
  }

  const updateSensorData = (data: SensorData) => {
    if (!pendingSensorUpdates) {
      pendingSensorUpdates = new Map()
    }
    pendingSensorUpdates.set(data.sensorId, data)
    scheduleSensorFlush()
  }

  const updateBatchSensorData = (dataArray: SensorData[]) => {
    if (!pendingSensorUpdates) {
      pendingSensorUpdates = new Map()
    }
    for (const data of dataArray) {
      pendingSensorUpdates.set(data.sensorId, data)
    }
    scheduleSensorFlush()
  }

  const updateDevice = (device: Device) => {
    const index = devices.value.findIndex(d => d.id === device.id)
    if (index !== -1) {
      devices.value[index] = device
    }
  }

  const addAlarm = (alarm: AlarmLog) => {
    const exists = pendingAlarms.value.find(a => a.id === alarm.id)
    if (!exists) {
      const duplicateSensorAlarm = pendingAlarms.value.find(
        a => a.sensorId === alarm.sensorId && a.level === alarm.level && a.status === 'pending'
      )
      if (duplicateSensorAlarm) {
        duplicateSensorAlarm.triggerValue = alarm.triggerValue
        duplicateSensorAlarm.timestamp = alarm.timestamp
        return
      }
      pendingAlarms.value.unshift(alarm)
      if (pendingAlarms.value.length > 50) {
        pendingAlarms.value = pendingAlarms.value.slice(0, 50)
      }
    }
  }

  const updateAlarms = (alarms: AlarmLog[]) => {
    pendingAlarms.value = alarms
  }

  const removeAlarm = (alarmId: string) => {
    const index = pendingAlarms.value.findIndex(a => a.id === alarmId)
    if (index !== -1) {
      pendingAlarms.value.splice(index, 1)
    }
  }

  const setSystemStats = (stats: SystemStats) => {
    systemStats.value = stats
  }

  const setSelectedCabin = (cabinId: string | null) => {
    selectedCabinId.value = cabinId
  }

  const setConnected = (connected: boolean) => {
    isConnected.value = connected
  }

  const initFromData = (data: {
    cabins: Cabin[]
    sensorData: SensorData[]
    devices: Device[]
    pendingAlarms: AlarmLog[]
    stats: SystemStats
  }) => {
    cabins.value = data.cabins
    devices.value = data.devices
    pendingAlarms.value = data.pendingAlarms
    systemStats.value = data.stats
    
    const newMap = new Map<string, SensorData>()
    data.sensorData.forEach(d => {
      newMap.set(d.sensorId, d)
    })
    sensorData.value = newMap
  }

  return {
    cabins,
    sensors,
    devices,
    sensorData,
    pendingAlarms,
    systemStats,
    selectedCabinId,
    isConnected,
    linkageRules,
    selectedCabin,
    cabinSensors,
    cabinDevices,
    cabinSensorData,
    activeAlarmCount,
    criticalAlarmCount,
    activeDeviceCount,
    getSensorData,
    getSensorValue,
    setCabins,
    setSensors,
    setDevices,
    setLinkageRules,
    updateSensorData,
    updateBatchSensorData,
    updateDevice,
    addAlarm,
    updateAlarms,
    removeAlarm,
    setSystemStats,
    setSelectedCabin,
    setConnected,
    initFromData,
  }
})
