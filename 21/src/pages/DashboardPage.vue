
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useMonitorStore } from '../stores/monitor'
import { useWebSocket } from '../composables/useWebSocket'
import api from '../api'
import StatCard from '../components/common/StatCard.vue'
import DataChart from '../components/dashboard/DataChart.vue'
import { sensorTypeMap } from '../types'

const store = useMonitorStore()
const { connect } = useWebSocket()

const selectedSensorId = ref('sensor-1-1')
const historyData = ref<Array<{ time: Date; value: number }>>([])
const timeRange = ref('1h')

const selectedSensor = computed(() => {
  return store.sensors.find(s => s.id === selectedSensorId.value)
})

const loadHistoryData = async () => {
  if (!selectedSensorId.value) return
  
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - getTimeRangeMs(timeRange.value))
  
  try {
    const response = await api.sensor.getHistory(selectedSensorId.value, startTime, endTime, getInterval(timeRange.value))
    historyData.value = response.data.map((d: any) => ({
      time: new Date(d.time),
      value: d.value,
    }))
  } catch (error) {
    console.error('加载历史数据失败:', error)
    generateMockData()
  }
}

const generateMockData = () => {
  const data: Array<{ time: Date; value: number }> = []
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - getTimeRangeMs(timeRange.value))
  const interval = getTimeRangeMs(timeRange.value) / 50
  
  let time = startTime.getTime()
  let value = 50
  
  while (time <= endTime.getTime()) {
    value += (Math.random() - 0.5) * 10
    value = Math.max(10, Math.min(90, value))
    data.push({ time: new Date(time), value: Math.round(value * 10) / 10 })
    time += interval
  }
  
  historyData.value = data
}

const getTimeRangeMs = (range: string): number => {
  switch (range) {
    case '1h': return 3600000
    case '6h': return 21600000
    case '24h': return 86400000
    case '7d': return 604800000
    default: return 3600000
  }
}

const getInterval = (range: string): string => {
  switch (range) {
    case '1h': return '1m'
    case '6h': return '5m'
    case '24h': return '15m'
    case '7d': return '1h'
    default: return '1m'
  }
}

const getSensorValue = (sensorId: string): number => {
  return store.getSensorValue(sensorId)
}

const getSensorInfo = (sensorId: string) => {
  return store.sensors.find(s => s.id === sensorId)
}

onMounted(async () => {
  connect()
  try {
    const res = await api.sensor.getAll()
    store.setSensors(res.sensors)
  } catch (error) {
    console.error('加载传感器数据失败:', error)
  }
  loadHistoryData()
})
</script>

<template>
  <div class="min-h-screen bg-slate-900 p-6">
    <div class="max-w-7xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-white">数据仪表盘</h1>
        <p class="text-slate-400 mt-1">多维度数据分析与历史趋势展示</p>
      </div>

      <div class="grid grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="平均温度" 
          :value="Math.round((getSensorValue('sensor-1-1') + getSensorValue('sensor-1-2') + getSensorValue('sensor-2-1')) / 3 * 10) / 10" 
          icon="Thermometer" 
          color="#ef4444"
          unit="°C"
        />
        <StatCard 
          title="平均湿度" 
          :value="Math.round((getSensorValue('sensor-1-3') + getSensorValue('sensor-2-3')) / 2)" 
          icon="Droplets" 
          color="#3b82f6"
          unit="%"
        />
        <StatCard 
          title="燃油液位" 
          :value="Math.round(getSensorValue('sensor-3-1'))" 
          icon="Fuel" 
          color="#f59e0b"
          unit="%"
        />
        <StatCard 
          title="主机油压" 
          :value="Number(getSensorValue('sensor-1-4')).toFixed(2)" 
          icon="Gauge" 
          color="#06b6d4"
          unit="MPa"
        />
      </div>

      <div class="grid grid-cols-12 gap-6">
        <div class="col-span-8 bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold text-white">历史趋势</h3>
              <p class="text-sm text-slate-400">{{ selectedSensor?.name }}</p>
            </div>
            <div class="flex gap-2">
              <select 
                v-model="selectedSensorId" 
                @change="loadHistoryData"
                class="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option v-for="sensor in store.sensors" :key="sensor.id" :value="sensor.id">
                  {{ sensor.name }}
                </option>
              </select>
              <div class="flex gap-1 bg-slate-700 rounded-lg p-1">
                <button 
                  v-for="range in ['1h', '6h', '24h', '7d']" 
                  :key="range"
                  @click="timeRange = range; loadHistoryData()"
                  class="px-3 py-1 text-xs rounded transition-colors"
                  :class="timeRange === range ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white'"
                >
                  {{ range }}
                </button>
              </div>
            </div>
          </div>
          <DataChart 
            :title="selectedSensor?.name" 
            :data="historyData" 
            :color="selectedSensor ? sensorTypeMap[selectedSensor.type]?.color : '#3b82f6'"
            :unit="selectedSensor?.unit"
          />
        </div>

        <div class="col-span-4 bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-5">
          <h3 class="text-lg font-semibold text-white mb-4">传感器概览</h3>
          <div class="space-y-3 max-h-96 overflow-y-auto">
            <div 
              v-for="sensor in store.sensors" 
              :key="sensor.id"
              class="p-3 bg-slate-700/30 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors"
              :class="{ 'ring-2 ring-blue-500': selectedSensorId === sensor.id }"
              @click="selectedSensorId = sensor.id; loadHistoryData()"
            >
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-white">{{ sensor.name }}</p>
                  <p class="text-xs text-slate-400">{{ store.cabins.find(c => c.id === sensor.cabinId)?.name }}</p>
                </div>
                <div class="text-right">
                  <p 
                    class="text-lg font-mono font-bold"
                    :style="{ color: sensorTypeMap[sensor.type]?.color }"
                  >
                    {{ getSensorValue(sensor.id) }}
                    <span class="text-sm font-normal text-slate-400">{{ sensor.unit }}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
