
<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import * as LucideIcons from 'lucide-vue-next'

const props = defineProps<{
  title: string
  value: string | number
  icon: string
  color?: string
  trend?: number
  unit?: string
}>()

const iconComponent = computed((): Component => {
  return (LucideIcons as any)[props.icon] || LucideIcons.Activity
})

const trendColor = computed(() => {
  if (!props.trend) return ''
  return props.trend > 0 ? 'text-green-400' : 'text-red-400'
})
</script>

<template>
  <div class="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-5 hover:border-slate-600 transition-all duration-300">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-slate-400 text-sm font-medium">{{ title }}</p>
        <p class="text-2xl font-bold text-white mt-1 font-mono">
          {{ value }}
          <span v-if="unit" class="text-sm text-slate-400 font-normal">{{ unit }}</span>
        </p>
        <p v-if="trend !== undefined" :class="trendColor" class="text-xs mt-1">
          {{ trend > 0 ? '↑' : '↓' }} {{ Math.abs(trend) }}%
        </p>
      </div>
      <div 
        class="w-12 h-12 rounded-lg flex items-center justify-center"
        :style="{ backgroundColor: (color || '#3b82f6') + '20' }"
      >
        <component :is="iconComponent" :size="24" :color="color || '#3b82f6'" />
      </div>
    </div>
  </div>
</template>
