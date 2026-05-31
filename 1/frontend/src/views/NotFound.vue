<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Home, ArrowLeft, AlertTriangle } from 'lucide-vue-next'

const router = useRouter()

function goHome() {
  router.push('/dashboard')
}

function goBack() {
  router.go(-1)
}
</script>

<template>
  <div class="not-found-page min-h-[calc(100vh-180px)] flex items-center justify-center">
    <div class="text-center">
      <div class="relative mb-8">
        <h1 class="text-[150px] font-bold text-accent-500/10 leading-none">404</h1>
        <div class="absolute inset-0 flex items-center justify-center">
          <AlertTriangle class="w-24 h-24 text-accent-500/50" />
        </div>
      </div>
      <h2 class="text-3xl font-bold text-dark-text mb-4">页面未找到</h2>
      <p class="text-dark-textSecondary mb-8 max-w-md mx-auto">
        抱歉，您访问的页面不存在或已被移除。请检查URL是否正确，或返回首页继续浏览。
      </p>
      <div class="flex items-center justify-center gap-4">
        <button
          class="px-6 py-3 bg-dark-card border border-dark-border rounded-lg text-dark-text hover:border-accent-500/50 hover:text-accent-400 transition-colors flex items-center gap-2"
          @click="goBack"
        >
          <ArrowLeft class="w-5 h-5" />
          返回上一页
        </button>
        <button
          class="px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition-colors flex items-center gap-2"
          @click="goHome"
        >
          <Home class="w-5 h-5" />
          返回首页
        </button>
      </div>
    </div>
  </div>
</template>
