<script setup lang="ts">
import { watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const activeTab = computed(() => {
  const path = route.path
  if (path.includes('/users')) return 'users'
  if (path.includes('/alarm')) return 'alarm'
  return 'users'
})

const tabs = [
  { key: 'users', label: '用户管理', path: '/settings/users' },
  { key: 'alarm', label: '告警配置', path: '/settings/alarm' }
]

function handleTabChange(key: string) {
  const tab = tabs.find(t => t.key === key)
  if (tab) {
    router.push(tab.path)
  }
}

watch(() => route.path, () => {
  if (route.path === '/settings') {
    router.push('/settings/users')
  }
}, { immediate: true })
</script>

<template>
  <div class="settings-page">
    <div class="mb-6">
      <h2 class="text-xl font-bold text-dark-text">系统配置</h2>
      <p class="text-sm text-dark-textSecondary mt-1">管理系统用户与告警配置</p>
    </div>

    <div class="bg-dark-card rounded-lg border border-dark-border">
      <div class="border-b border-dark-border">
        <nav class="flex gap-1 px-4">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            :class="[
              'px-6 py-4 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.key
                ? 'text-accent-400 border-accent-400'
                : 'text-dark-textSecondary border-transparent hover:text-dark-text'
            ]"
            @click="handleTabChange(tab.key)"
          >
            {{ tab.label }}
          </button>
        </nav>
      </div>

      <div class="p-6">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
