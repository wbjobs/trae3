
<script setup lang="ts">
import { computed } from 'vue'
import type { Device } from '../../types'
import { deviceTypeMap } from '../../types'
import { useWebSocket } from '../../composables/useWebSocket'

const props = defineProps<{
  device: Device
}>()

const { sendDeviceControl } = useWebSocket()

const deviceInfo = computed(() => {
  return deviceTypeMap[props.device.type] || { label: props.device.type, icon: 'Cog' }
})

const statusColor = computed(() => {
  switch (props.device.status) {
    case 'on': return 'text-green-400'
    case 'off': return 'text-slate-400'
    case 'error': return 'text-red-400'
    default: return 'text-slate-400'
  }
})

const statusBg = computed(() => {
  switch (props.device.status) {
    case 'on': return 'bg-green-500/20'
    case 'off': return 'bg-slate-600/20'
    case 'error': return 'bg-red-500/20'
    default: return 'bg-slate-600/20'
  }
})

const toggleDevice = () => {
  const action = props.device.status === 'on' ? 'turnOff' : 'turnOn'
  sendDeviceControl(props.device.id, action)
}

const setValue = (value: number) => {
  sendDeviceControl(props.device.id, 'setValue', value)
}
</script>

<template>
  <div class="bg-slate-700/30 rounded-lg p-3">
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <div 
          class="w-8 h-8 rounded-lg flex items-center justify-center"
          :class="statusBg"
        >
          <svg class="w-4 h-4" :class="statusColor" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path v-if="device.type === 'fan'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            <path v-else-if="device.type === 'pump'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            <path v-else-if="device.type === 'valve'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          </svg>
        </div>
        <div>
          <p class="text-sm font-medium text-white">{{ device.name }}</p>
          <p class="text-xs text-slate-400">{{ deviceInfo.label }}</p>
        </div>
      </div>
      <button 
        @click="toggleDevice"
        class="relative w-10 h-5 rounded-full transition-colors"
        :class="device.status === 'on' ? 'bg-green-500' : 'bg-slate-600'"
      >
        <span 
          class="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform"
          :class="device.status === 'on' ? 'translate-x-5' : 'translate-x-0.5'"
        />
      </button>
    </div>
    
    <div v-if="device.type !== 'valve'" class="mt-2">
      <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
        <span>功率</span>
        <span class="font-mono">{{ device.currentValue }}%</span>
      </div>
      <input 
        type="range" 
        :value="device.currentValue" 
        @change="setValue(Number(($event.target as HTMLInputElement).value))"
        min="0" 
        max="100" 
        class="w-full h-1.5 bg-slate-600 rounded-full appearance-none cursor-pointer accent-blue-500"
        :disabled="device.status === 'off'"
      />
    </div>
  </div>
</template>
