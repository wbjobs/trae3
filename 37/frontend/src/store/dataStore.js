import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDataStore = defineStore('data', () => {
  const devices = ref([])
  const selectedDevice = ref(null)
  const timeRange = ref({
    start: null,
    end: null
  })

  const setDevices = (data) => {
    devices.value = data
  }

  const setSelectedDevice = (device) => {
    selectedDevice.value = device
  }

  const setTimeRange = (start, end) => {
    timeRange.value = { start, end }
  }

  return {
    devices,
    selectedDevice,
    timeRange,
    setDevices,
    setSelectedDevice,
    setTimeRange
  }
})
