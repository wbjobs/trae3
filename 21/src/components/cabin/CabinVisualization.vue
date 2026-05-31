
<script setup lang="ts">
import { computed } from 'vue'
import { useMonitorStore } from '../../stores/monitor'
import { sensorTypeMap } from '../../types'
import CabinSVG from './CabinSVG.vue'

const store = useMonitorStore()

const cabins = computed(() => store.cabins)
const selectedCabinId = computed(() => store.selectedCabinId)

const selectCabin = (cabinId: string) => {
  store.setSelectedCabin(selectedCabinId.value === cabinId ? null : cabinId)
}

const getCabinSensorCount = (cabinId: string) => {
  return store.cabinSensorData.filter(d => d.cabinId === cabinId).length
}

const getCabinDeviceCount = (cabinId: string) => {
  return store.devices.filter(d => d.cabinId === cabinId).length
}

const getCabinAlarmCount = (cabinId: string) => {
  const sensorIds = store.sensors.filter(s => s.cabinId === cabinId).map(s => s.id)
  return store.pendingAlarms.filter(a => sensorIds.includes(a.sensorId)).length
}
</script>

<template>
  <div class="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-white">舱室总览</h3>
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        <span class="text-xs text-slate-400">实时监控中</span>
      </div>
    </div>
    
    <CabinSVG 
      :cabins="cabins"
      :selected-cabin-id="selectedCabinId"
      @select="selectCabin"
    />

    <div class="mt-4 grid grid-cols-5 gap-2">
      <div 
        v-for="cabin in cabins" 
        :key="cabin.id"
        class="p-2 rounded-lg cursor-pointer transition-all"
        :class="[
          selectedCabinId === cabin.id 
            ? 'bg-blue-500/20 border border-blue-500' 
            : 'bg-slate-700/30 hover:bg-slate-700/50 border border-transparent'
        ]"
        @click="selectCabin(cabin.id)"
      >
        <p class="text-xs font-medium text-white truncate">{{ cabin.name }}</p>
        <div class="flex items-center justify-between mt-1">
          <span class="text-xs text-slate-400">{{ getCabinSensorCount(cabin.id) }} 传感器</span>
          <span 
            v-if="getCabinAlarmCount(cabin.id) > 0"
            class="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded"
          >
            {{ getCabinAlarmCount(cabin.id) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
