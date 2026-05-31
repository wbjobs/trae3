
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMonitorStore } from '../stores/monitor'
import { useWebSocket } from '../composables/useWebSocket'
import api from '../api'
import { alarmLevelMap, type AlarmLog } from '../types'

const store = useMonitorStore()
const { connect, acknowledgeAlarm, resolveAlarm } = useWebSocket()

const activeTab = ref<'pending' | 'history'>('pending')
const historyLogs = ref<AlarmLog[]>([])
const selectedLevel = ref<string>('all')

const filteredPendingAlarms = computed(() => {
  let alarms = store.pendingAlarms
  if (selectedLevel.value !== 'all') {
    alarms = alarms.filter(a => a.level === selectedLevel.value)
  }
  return alarms
})

const filteredHistoryLogs = computed(() => {
  if (selectedLevel.value === 'all') return historyLogs.value
  return historyLogs.value.filter(a => a.level === selectedLevel.value)
})

const loadHistoryLogs = async () => {
  try {
    const res = await api.alarm.getLogs(100)
    historyLogs.value = res.logs.map((l: any) => ({
      ...l,
      timestamp: new Date(l.timestamp),
      resolvedAt: l.resolvedAt ? new Date(l.resolvedAt) : undefined,
    }))
  } catch (error) {
    console.error('加载历史告警失败:', error)
  }
}

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

onMounted(() => {
  connect()
  loadHistoryLogs()
})
</script>

<template>
  <div class="min-h-screen bg-slate-900 p-6">
    <div class="max-w-7xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-white">告警中心</h1>
        <p class="text-slate-400 mt-1">查看和处理设备告警信息</p>
      </div>

      <div class="flex gap-4 mb-6">
        <div class="flex bg-slate-800 rounded-lg p-1">
          <button 
            @click="activeTab = 'pending'"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
            :class="activeTab === 'pending' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'"
          >
            待处理
            <span v-if="store.activeAlarmCount > 0" class="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
              {{ store.activeAlarmCount }}
            </span>
          </button>
          <button 
            @click="activeTab = 'history'; loadHistoryLogs()"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
            :class="activeTab === 'history' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'"
          >
            历史记录
          </button>
        </div>

        <div class="flex gap-1 bg-slate-800 rounded-lg p-1">
          <button 
            @click="selectedLevel = 'all'"
            class="px-3 py-1.5 rounded text-xs transition-colors"
            :class="selectedLevel === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'"
          >
            全部
          </button>
          <button 
            @click="selectedLevel = 'critical'"
            class="px-3 py-1.5 rounded text-xs transition-colors"
            :class="selectedLevel === 'critical' ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-white'"
          >
            严重
          </button>
          <button 
            @click="selectedLevel = 'warning'"
            class="px-3 py-1.5 rounded text-xs transition-colors"
            :class="selectedLevel === 'warning' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'"
          >
            警告
          </button>
        </div>
      </div>

      <div v-if="activeTab === 'pending'" class="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl overflow-hidden">
        <div v-if="filteredPendingAlarms.length === 0" class="py-16 text-center text-slate-400">
          <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>暂无待处理告警</p>
        </div>
        <table v-else class="w-full">
          <thead class="bg-slate-700/30">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">级别</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">传感器</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">舱室</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">触发值</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">时间</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">状态</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-700/50">
            <tr v-for="alarm in filteredPendingAlarms" :key="alarm.id" class="hover:bg-slate-700/20">
              <td class="px-4 py-3">
                <span 
                  class="px-2 py-1 text-xs rounded"
                  :class="alarmLevelMap[alarm.level]?.bgColor"
                  :style="{ color: alarmLevelMap[alarm.level]?.color }"
                >
                  {{ alarmLevelMap[alarm.level]?.label }}
                </span>
              </td>
              <td class="px-4 py-3 text-white text-sm">{{ getSensorName(alarm.sensorId) }}</td>
              <td class="px-4 py-3 text-slate-400 text-sm">{{ getCabinName(alarm.sensorId) }}</td>
              <td class="px-4 py-3 font-mono text-sm text-white">{{ alarm.triggerValue }}</td>
              <td class="px-4 py-3 text-slate-400 text-sm">{{ formatTime(alarm.timestamp) }}</td>
              <td class="px-4 py-3">
                <span 
                  class="px-2 py-1 text-xs rounded"
                  :class="alarm.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'"
                >
                  {{ alarm.status === 'pending' ? '待处理' : '已确认' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex gap-2 justify-end">
                  <button 
                    v-if="alarm.status === 'pending'"
                    @click="acknowledgeAlarm(alarm.id)"
                    class="px-3 py-1 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
                  >
                    确认
                  </button>
                  <button 
                    @click="resolveAlarm(alarm.id)"
                    class="px-3 py-1 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded transition-colors"
                  >
                    解决
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl overflow-hidden">
        <table class="w-full">
          <thead class="bg-slate-700/30">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">级别</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">传感器</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">舱室</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">触发值</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">触发时间</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">状态</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-700/50">
            <tr v-for="alarm in filteredHistoryLogs" :key="alarm.id" class="hover:bg-slate-700/20">
              <td class="px-4 py-3">
                <span 
                  class="px-2 py-1 text-xs rounded"
                  :class="alarmLevelMap[alarm.level]?.bgColor"
                  :style="{ color: alarmLevelMap[alarm.level]?.color }"
                >
                  {{ alarmLevelMap[alarm.level]?.label }}
                </span>
              </td>
              <td class="px-4 py-3 text-white text-sm">{{ getSensorName(alarm.sensorId) }}</td>
              <td class="px-4 py-3 text-slate-400 text-sm">{{ getCabinName(alarm.sensorId) }}</td>
              <td class="px-4 py-3 font-mono text-sm text-white">{{ alarm.triggerValue }}</td>
              <td class="px-4 py-3 text-slate-400 text-sm">{{ formatTime(alarm.timestamp) }}</td>
              <td class="px-4 py-3">
                <span 
                  class="px-2 py-1 text-xs rounded"
                  :class="{
                    'bg-green-500/20 text-green-400': alarm.status === 'resolved',
                    'bg-blue-500/20 text-blue-400': alarm.status === 'acknowledged',
                    'bg-amber-500/20 text-amber-400': alarm.status === 'pending',
                  }"
                >
                  {{ alarm.status === 'resolved' ? '已解决' : alarm.status === 'acknowledged' ? '已确认' : '待处理' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
