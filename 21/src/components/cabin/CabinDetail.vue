
<script setup lang="ts">
import { computed } from 'vue'
import { useMonitorStore } from '../../stores/monitor'
import { sensorTypeMap } from '../../types'
import SensorGauge from '../common/SensorGauge.vue'
import DeviceCard from '../control/DeviceCard.vue'

const store = useMonitorStore()

const selectedCabin = computed(() => store.selectedCabin)
const cabinSensorData = computed(() => store.cabinSensorData)
const cabinDevices = computed(() => store.cabinDevices)

const getSensorInfo = (sensorId: string) => {
  return store.sensors.find(s => s.id === sensorId)
}

const formatTime = (date: Date) => {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div v-if="selectedCabin" class="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-5">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-lg font-semibold text-white">{{ selectedCabin.name }}</h3>
        <p class="text-sm text-slate-400">{{ selectedCabin.position }} · {{ selectedCabin.description }}</p>
      </div>
      <button 
        @click="store.setSelectedCabin(null)"
        class="p-2 hover:bg-slate-700 rounded-lg transition-colors"
      >
        <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="space-y-4">
      <div>
        <h4 class="text-sm font-medium text-slate-400 mb-3">传感数据</h4>
        <div class="grid grid-cols-2 gap-3">
          <div 
            v-for="data in cabinSensorData" 
            :key="data.sensorId"
            class="bg-slate-700/30 rounded-lg p-3"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-slate-400">{{ getSensorInfo(data.sensorId)?.name || data.sensorType }}</span>
              <span class="text-xs text-slate-500">{{ formatTime(data.timestamp) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span 
                class="text-xl font-bold font-mono"
                :style="{ color: sensorTypeMap[data.sensorType]?.color }"
              >
                {{ data.value }}
              </span>
              <span class="text-sm text-slate-400">{{ data.unit }}</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h4 class="text-sm font-medium text-slate-400 mb-3">设备状态</h4>
        <div class="grid grid-cols-2 gap-3">
          <DeviceCard 
            v-for="device in cabinDevices" 
            :key="device.id"
            :device="device"
          />
        </div>
      </div>
    </div>
  </div>

  <div v-else class="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-5 flex items-center justify-center h-64">
    <div class="text-center text-slate-400">
      <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
      </svg>
      <p>点击舱室查看详细信息</p>
    </div>
  </div>
</template>
