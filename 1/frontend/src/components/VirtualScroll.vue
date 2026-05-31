<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, type PropType } from 'vue'

const props = defineProps({
  items: { type: Array as PropType<any[]>, required: true },
  itemHeight: { type: Number, default: 48 },
  buffer: { type: Number, default: 5 },
  containerHeight: { type: String, default: '100%' }
})

const containerRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
let rafId: number | null = null

const totalHeight = computed(() => props.items.length * props.itemHeight)

const visibleRange = computed(() => {
  const container = containerRef.value
  const viewHeight = container ? container.clientHeight : 0
  const start = Math.floor(scrollTop.value / props.itemHeight)
  const visibleCount = Math.ceil(viewHeight / props.itemHeight)
  const end = start + visibleCount
  return {
    start: Math.max(0, start - props.buffer),
    end: Math.min(props.items.length, end + props.buffer)
  }
})

const visibleItems = computed(() => {
  const { start, end } = visibleRange.value
  const result: { item: any; index: number; offset: number }[] = []
  for (let i = start; i < end; i++) {
    result.push({
      item: props.items[i],
      index: i,
      offset: i * props.itemHeight
    })
  }
  return result
})

function onScroll() {
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    if (containerRef.value) {
      scrollTop.value = containerRef.value.scrollTop
    }
    rafId = null
  })
}

function scrollTo(index: number) {
  if (!containerRef.value) return
  const targetTop = Math.max(0, index * props.itemHeight)
  containerRef.value.scrollTop = targetTop
  scrollTop.value = targetTop
}

onMounted(() => {
  if (containerRef.value) {
    scrollTop.value = containerRef.value.scrollTop
  }
})

onBeforeUnmount(() => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
})

defineExpose({ scrollTo })
</script>

<template>
  <div
    ref="containerRef"
    class="virtual-scroll-container"
    :style="({ height: containerHeight, overflowY: 'auto' } as any)"
    @scroll="onScroll"
  >
    <div class="virtual-scroll-spacer" :style="({ height: `${totalHeight}px`, position: 'relative' } as any)">
      <div
        v-for="entry in visibleItems"
        :key="entry.index"
        class="virtual-scroll-item"
        :style="({ height: `${itemHeight}px`, transform: `translateY(${entry.offset}px)`, position: 'absolute', left: 0, right: 0 } as any)"
      >
        <slot :item="entry.item" :index="entry.index" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtual-scroll-container {
  width: 100%;
}
</style>
