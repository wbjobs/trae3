
<script setup lang="ts">
import { onMounted } from 'vue'
import { useMonitorStore } from '../stores/monitor'
import { useWebSocket } from '../composables/useWebSocket'
import StatCard from '../components/common/StatCard.vue'
import CabinVisualization from '../components/cabin/CabinVisualization.vue'
import CabinDetail from '../components/cabin/CabinDetail.vue'
import AlarmList from '../components/alarm/AlarmList.vue'
import AlarmBanner from '../components/alarm/AlarmBanner.vue'

const store = useMonitorStore()
const { connect, isConnected } = useWebSocket()

onMounted(() => {
  connect()
})
</script>

<template>
  <div class="min-h-screen bg-slate-900 p-6">
    <AlarmBanner />
    
    <div class="max-w-7xl mx-auto">
      <div class="mb-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-white">船舶舱内传感监控平台</h1>
            <p class="text-slate-400 mt-1">实时监控船舶各舱室传感数据与设备状态</p>
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span 
                class="w-2 h-2 rounded-full"
                :class="isConnected ? 'bg-green-500' : 'bg-red-500'"
              ></span>
              <span class="text-sm text-slate-400">
                {{ isConnected ? '已连接' : '连接中...' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="传感器总数" 
          :value="store.systemStats?.totalSensors || 0" 
          icon="Activity" 
          color="#3b82f6"
        />
        <StatCard 
          title="在线设备" 
          :value="store.systemStats?.activeDevices || 0" 
          icon="Cpu" 
          color="#22c55e"
        />
        <StatCard 
          title="活动告警" 
          :value="store.systemStats?.activeAlarms || 0" 
          icon="AlertTriangle" 
          color="#ef4444"
        />
        <StatCard 
          title="今日数据点" 
          :value="(store.systemStats?.dataPointsToday || 0).toLocaleString()" 
          icon="Database" 
          color="#a855f7"
        />
      </div>

      <div class="grid grid-cols-12 gap-6">
        <div class="col-span-8 space-y-6">
          <CabinVisualization />
          <CabinDetail />
        </div>
        
        <div class="col-span-4">
          <AlarmList />
        </div>
      </div>
    </div>
  </div>
</template>
