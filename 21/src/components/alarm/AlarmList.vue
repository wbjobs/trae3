
<script setup lang="ts">
import { computed } from 'vue'
import { useMonitorStore } from '../../stores/monitor'
import { alarmLevelMap, type AlarmLog } from '../../types'
import { useWebSocket } from '../../composables/useWebSocket'

const store = useMonitorStore()
const { acknowledgeAlarm, resolveAlarm } = useWebSocket()

const alarms = computed(() => store.pendingAlarms)

const formatTime = (date: Date) => {
  return new Date(date).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const getSensorName = (sensorId: string) => {
  const sensor = store.sensors.find(s => s.id === sensorId)
  return sensor?.name || sensorId
}

const getCabinName = (sensorId: string) => {
  const sensor = store.sensors.find(s => s.id === sensorId)
  if (!sensor) return ''
  const cabin = store.cabins.find(c => c.id === sensor.cabinId)
  return cabin?.name || sensor.cabinId
}
</script>

<template>
  <div class="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-white">告警中心</h3>
      <span 
        v-if="alarms.length > 0"
        class="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded"
      >
        {{ alarms.length }} 待处理
      </span>
    </div>

    <div v-if="alarms.length === 0" class="py-8 text-center text-slate-400">
      <svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p>暂无告警信息</p>
    </div>

    <div v-else class="space-y-2 max-h-64 overflow-y-auto">
      <div 
        v-for="alarm in alarms" 
        :key="alarm.id"
        class="p-3 rounded-lg border transition-all"
        :class="[
          alarm.status === 'pending' ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-700/10 border-slate-700',
          alarm.level === 'critical' ? 'border-l-4 border-l-red-500' : 
          alarm.level === 'warning' ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-blue-500'
        ]"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span 
                class="px-2 py-0.5 text-xs rounded"
                :class="alarmLevelMap[alarm.level]?.bgColor"
                :style="{ color: alarmLevelMap[alarm.level]?.color }"
              >
                {{ alarmLevelMap[alarm.level]?.label }}
              </span>
              <span class="text-sm font-medium text-white">{{ getSensorName(alarm.sensorId) }}</span>
              <span class="text-xs text-slate-400">{{ getCabinName(alarm.sensorId) }}</span>
            </div>
            <p class="text-sm text-slate-300">
              触发值: <span class="font-mono">{{ alarm.triggerValue }}</span>
            </p>
            <p class="text-xs text-slate-500 mt-1">{{ formatTime(alarm.timestamp) }}</p>
          </div>
          <div class="flex gap-1">
            <button 
              v-if="alarm.status === 'pending'"
              @click="acknowledgeAlarm(alarm.id)"
              class="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
            >
              确认
            </button>
            <button 
              @click="resolveAlarm(alarm.id)"
              class="px-2 py-1 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded transition-colors"
            >
              解决
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
