import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Environment } from '@/types'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const currentEnv = ref<Environment>(
    (import.meta.env.VITE_APP_ENV as Environment) || 'development'
  )
  const theme = ref<'dark' | 'light'>('dark')
  const loadingCount = ref(0)

  const isLoading = computed(() => loadingCount.value > 0)
  
  const envText = computed(() => {
    return currentEnv.value === 'production' ? '生产环境' : '测试环境'
  })

  const envColor = computed(() => {
    return currentEnv.value === 'production' ? 'var(--el-color-danger)' : 'var(--el-color-primary)'
  })

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function setEnv(env: Environment) {
    currentEnv.value = env
  }

  function setTheme(newTheme: 'dark' | 'light') {
    theme.value = newTheme
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  function startLoading() {
    loadingCount.value++
  }

  function stopLoading() {
    if (loadingCount.value > 0) {
      loadingCount.value--
    }
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('node_trace_theme') as 'dark' | 'light' | null
    if (savedTheme) {
      setTheme(savedTheme)
    } else {
      setTheme('dark')
    }
  }

  function initFromStorage() {
    const savedEnv = localStorage.getItem('node_trace_env') as Environment | null
    if (savedEnv) {
      setEnv(savedEnv)
    }
    initTheme()
  }

  return {
    sidebarCollapsed,
    currentEnv,
    theme,
    loadingCount,
    isLoading,
    envText,
    envColor,
    toggleSidebar,
    setEnv,
    setTheme,
    startLoading,
    stopLoading,
    initTheme,
    initFromStorage
  }
})
