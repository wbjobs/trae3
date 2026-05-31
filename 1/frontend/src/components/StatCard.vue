<script setup lang="ts">
import { computed } from 'vue'
import {
  Server,
  Activity,
  AlertTriangle,
  XCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown
} from 'lucide-vue-next'

const props = defineProps<{
  title: string
  value: number | string
  icon?: string
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  trend?: number
  unit?: string
  subtitle?: string
}>()

const iconComponent = computed(() => {
  const icons: Record<string, any> = {
    server: Server,
    activity: Activity,
    warning: AlertTriangle,
    error: XCircle,
    success: CheckCircle
  }
  return icons[props.icon || 'activity'] || Activity
})

const colorClasses = computed(() => {
  const colors: Record<string, string> = {
    primary: 'text-accent-400 bg-accent-500/10 border-accent-500/20',
    success: 'text-success bg-success/10 border-success/20',
    warning: 'text-warning bg-warning/10 border-warning/20',
    danger: 'text-danger bg-danger/10 border-danger/20',
    info: 'text-info bg-info/10 border-info/20'
  }
  return colors[props.color || 'primary']
})
</script>

<template>
  <div class="stat-card bg-dark-card rounded-lg border border-dark-border p-5 hover:shadow-card transition-all duration-300 hover:border-accent-500/30">
    <div class="flex items-start justify-between mb-4">
      <div>
        <p class="text-dark-textSecondary text-sm mb-1">{{ title }}</p>
        <p class="text-2xl font-bold font-mono">
          {{ value }}
          <span v-if="unit" class="text-sm font-normal text-dark-textSecondary ml-1">{{ unit }}</span>
        </p>
      </div>
      <div :class="['w-12 h-12 rounded-lg flex items-center justify-center border', colorClasses]">
        <component :is="iconComponent" class="w-6 h-6" />
      </div>
    </div>
    
    <div v-if="trend !== undefined" class="flex items-center gap-1 text-sm">
      <TrendingUp v-if="trend >= 0" class="w-4 h-4 text-success" />
      <TrendingDown v-else class="w-4 h-4 text-danger" />
      <span :class="trend >= 0 ? 'text-success' : 'text-danger'">
        {{ Math.abs(trend) }}%
      </span>
      <span class="text-dark-textSecondary">较昨日</span>
    </div>
    
    <p v-else-if="subtitle" class="text-xs text-dark-textSecondary mt-2">
      {{ subtitle }}
    </p>
  </div>
</template>

<style scoped>
.stat-card:hover {
  transform: translateY(-2px);
}
</style>
