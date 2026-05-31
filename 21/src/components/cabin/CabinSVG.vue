
<script setup lang="ts">
import type { Cabin } from '../../types'

defineProps<{
  cabins: Cabin[]
  selectedCabinId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', cabinId: string): void
}>()

const cabinPositions: Record<string, { x: number; y: number; width: number; height: number }> = {
  'cabin-1': { x: 50, y: 60, width: 120, height: 70 },
  'cabin-2': { x: 180, y: 60, width: 100, height: 70 },
  'cabin-3': { x: 290, y: 60, width: 90, height: 70 },
  'cabin-4': { x: 390, y: 60, width: 90, height: 70 },
  'cabin-5': { x: 50, y: 140, width: 430, height: 40 },
}
</script>

<template>
  <div class="relative w-full" style="height: 200px;">
    <svg viewBox="0 0 520 200" class="w-full h-full">
      <defs>
        <linearGradient id="shipGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#1e293b;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <path 
        d="M20,40 Q10,100 30,180 L490,180 Q510,100 500,40 Z" 
        fill="url(#shipGradient)" 
        stroke="#475569" 
        stroke-width="2"
      />

      <g 
        v-for="cabin in cabins" 
        :key="cabin.id"
        class="cursor-pointer"
        @click="emit('select', cabin.id)"
      >
        <rect
          :x="cabinPositions[cabin.id]?.x || 0"
          :y="cabinPositions[cabin.id]?.y || 0"
          :width="cabinPositions[cabin.id]?.width || 0"
          :height="cabinPositions[cabin.id]?.height || 0"
          rx="6"
          :fill="selectedCabinId === cabin.id ? '#3b82f6' : '#334155'"
          :stroke="selectedCabinId === cabin.id ? '#60a5fa' : '#64748b'"
          stroke-width="2"
          class="transition-all duration-300"
          :filter="selectedCabinId === cabin.id ? 'url(#glow)' : ''"
        />
        <text
          :x="(cabinPositions[cabin.id]?.x || 0) + (cabinPositions[cabin.id]?.width || 0) / 2"
          :y="(cabinPositions[cabin.id]?.y || 0) + (cabinPositions[cabin.id]?.height || 0) / 2 + 4"
          text-anchor="middle"
          fill="white"
          font-size="11"
          font-weight="500"
        >
          {{ cabin.name }}
        </text>
      </g>

      <g transform="translate(20, 20)">
        <circle cx="0" cy="0" r="4" fill="#22c55e" class="animate-pulse" />
        <text x="12" y="4" fill="#94a3b8" font-size="10">船首</text>
      </g>

      <g transform="translate(470, 20)">
        <text x="0" y="4" fill="#94a3b8" font-size="10">船尾</text>
      </g>
    </svg>
  </div>
</template>
