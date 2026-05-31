<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMonitorStore } from '../../stores/monitor'
import { alarmLevelMap } from '../../types'
import { useWebSocket } from '../../composables/useWebSocket'

const store = useMonitorStore()
const { acknowledgeAlarm, resolveAlarm } = useWebSocket()

const isExpanded = ref(false)
const isDismissed = ref(false)
const lastAlarmId = ref('')

const criticalAlarms = computed(() => 
  store.pendingAlarms.filter(a => a.level === 'critical' && a.status === 'pending')
)
const warningAlarms = computed(() => 
  store.pendingAlarms.filter(a => a.level === 'warning' && a.status === 'pending')
)

const hasCriticalAlarm = computed(() => criticalAlarms.value.length > 0)
const hasAnyAlarm = computed(() => store.pendingAlarms.length > 0)

const visibleAlarms = computed(() => {
  if (isExpanded.value) {
    return store.pendingAlarms.slice(0, 10)
  }
  return store.pendingAlarms.slice(0, 2)
})

watch(() => store.pendingAlarms.length, (newLen, oldLen) => {
  if (newLen > oldLen && store.pendingAlarms.length > 0) {
    const latestAlarm = store.pendingAlarms[0]
    if (latestAlarm.id !== lastAlarmId.value) {
      lastAlarmId.value = latestAlarm.id
      isDismissed.value = false
    }
  }
})

const formatTime = (date: Date) => {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const getSensorName = (sensorId: string) => {
  const sensor = store.sensors.find(s => s.id === sensorId)
  return sensor?.name || sensorId
}

const dismissBanner = () => {
  isDismissed.value = true
}
</script>

<template>
  <Transition name="slide-down">
    <div 
      v-if="hasAnyAlarm && !isDismissed"
      class="fixed top-16 left-0 right-0 z-50"
    >
      <div 
        class="mx-4 rounded-lg overflow-hidden shadow-2xl"
        :class="hasCriticalAlarm ? 'bg-red-500/20 border border-red-500/50' : 'bg-amber-500/20 border border-amber-500/50'"
      >
        <div class="px-4 py-2 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div v-if="hasCriticalAlarm" class="animate-pulse">
              <svg class="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
              </svg>
            </div>
            <svg v-else class="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
            <span class="text-sm font-medium text-white">
              <span v-if="hasCriticalAlarm">{{ criticalAlarms.length }} 个严重告警</span>
              <span v-else>{{ warningAlarms.length }} 个警告告警</span>
            </span>
            <span class="text-xs text-slate-300">
              最新: {{ formatTime(store.pendingAlarms[0]?.timestamp) }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button 
              @click="isExpanded = !isExpanded"
              class="text-xs text-slate-300 hover:text-white transition-colors"
            >
              {{ isExpanded ? '收起' : '展开' }}
            </button>
            <button 
              @click="dismissBanner"
              class="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div v-if="isExpanded" class="border-t border-slate-700/50 max-h-32 overflow-y-auto">
          <div 
            v-for="alarm in visibleAlarms" 
            :key="alarm.id"
            class="px-4 py-2 flex items-center justify-between text-sm hover:bg-white/5"
          >
            <div class="flex items-center gap-2">
              <span 
                class="px-2 py-0.5 text-xs rounded"
                :class="alarmLevelMap[alarm.level]?.bgColor"
                :style="{ color: alarmLevelMap[alarm.level]?.color }"
              >
                {{ alarmLevelMap[alarm.level]?.label }}
              </span>
              <span class="text-white">{{ getSensorName(alarm.sensorId) }}</span>
              <span class="text-slate-400">触发值: {{ alarm.triggerValue }}</span>
            </div>
            <div class="flex items-center gap-1">
              <button 
                v-if="alarm.status === 'pending'"
                @click="acknowledgeAlarm(alarm.id)"
                class="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-white transition-colors"
              >
                确认
              </button>
              <button 
                @click="resolveAlarm(alarm.id)"
                class="px-2 py-1 text-xs bg-green-700/50 hover:bg-green-700/70 rounded text-green-300 transition-colors"
              >
                解决
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
