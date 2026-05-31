
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMonitorStore } from '../stores/monitor'
import { useWebSocket } from '../composables/useWebSocket'
import DeviceCard from '../components/control/DeviceCard.vue'
import { deviceTypeMap } from '../types'

const store = useMonitorStore()
const { connect, sendDeviceControl } = useWebSocket()

const selectedCabinId = ref<string | null>(null)

const filteredDevices = computed(() => {
  if (!selectedCabinId.value) return store.devices
  return store.devices.filter(d => d.cabinId === selectedCabinId.value)
})

const getCabinName = (cabinId: string) => {
  return store.cabins.find(c => c.id === cabinId)?.name || cabinId
}

const turnAllOn = () => {
  filteredDevices.value.forEach(device => {
    sendDeviceControl(device.id, 'turnOn')
  })
}

const turnAllOff = () => {
  filteredDevices.value.forEach(device => {
    sendDeviceControl(device.id, 'turnOff')
  })
}

onMounted(() => {
  connect()
})
</script>

<template>
  <div class="min-h-screen bg-slate-900 p-6">
    <div class="max-w-7xl mx-auto">
      <div class="mb-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-white">设备控制</h1>
            <p class="text-slate-400 mt-1">远程控制船舶各舱室辅助设备</p>
          </div>
          <div class="flex gap-2">
            <button 
              @click="turnAllOn"
              class="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              全部开启
            </button>
            <button 
              @click="turnAllOff"
              class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              全部关闭
            </button>
          </div>
        </div>
      </div>

      <div class="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button 
          @click="selectedCabinId = null"
          class="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
          :class="selectedCabinId === null ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'"
        >
          全部舱室
        </button>
        <button 
          v-for="cabin in store.cabins" 
          :key="cabin.id"
          @click="selectedCabinId = cabin.id"
          class="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
          :class="selectedCabinId === cabin.id ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'"
        >
          {{ cabin.name }}
        </button>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <div 
          v-for="device in filteredDevices" 
          :key="device.id"
          class="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-4"
        >
          <div class="text-xs text-slate-400 mb-2">
            {{ getCabinName(device.cabinId) }}
          </div>
          <DeviceCard :device="device" />
        </div>
      </div>

      <div v-if="filteredDevices.length === 0" class="py-16 text-center text-slate-400">
        <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
        <p>暂无设备</p>
      </div>
    </div>
  </div>
</template>
