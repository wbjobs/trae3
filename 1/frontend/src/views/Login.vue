<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { useAppStore } from '@/store/app'
import type { Environment } from '@/types'
import {
  User,
  Lock,
  Link2,
  AlertCircle
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const appStore = useAppStore()

const form = ref({
  username: 'admin',
  password: 'admin123',
  environment: 'development' as Environment
})

const loading = ref(false)
const errorMsg = ref('')

const activeTab = ref<'login' | 'env'>('login')

const envOptions = [
  { value: 'development', label: '测试环境', desc: '用于开发和测试', color: 'text-accent-400' },
  { value: 'production', label: '生产环境', desc: '正式运行环境', color: 'text-danger' }
]

async function handleLogin() {
  if (!form.value.username || !form.value.password) {
    errorMsg.value = '请输入用户名和密码'
    return
  }

  loading.value = true
  errorMsg.value = ''

  try {
    const success = await userStore.login(
      form.value.username,
      form.value.password,
      form.value.environment
    )
    if (success) {
      appStore.setEnv(form.value.environment)
      const redirect = route.query.redirect as string
      router.push(redirect || '/dashboard')
    }
  } catch (error: any) {
    errorMsg.value = error.message || '登录失败，请检查用户名和密码'
  } finally {
    loading.value = false
  }
}

function selectEnv(env: Environment) {
  form.value.environment = env
  activeTab.value = 'login'
}

onMounted(() => {
  appStore.initTheme()
})
</script>

<template>
  <div class="login-container min-h-screen bg-dark-bg flex items-center justify-center p-4 relative overflow-hidden">
    <div class="absolute inset-0 overflow-hidden">
      <div class="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_rgba(0,212,255,0.1)_0%,_transparent_50%)]" />
      <div class="absolute bottom-0 right-0 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl" />
      <div class="absolute top-1/4 left-1/4 w-64 h-64 bg-primary-500/5 rounded-full blur-3xl" />
      
      <div class="absolute inset-0 opacity-20"
           style="background-image: linear-gradient(rgba(0,212,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.1) 1px, transparent 1px); background-size: 50px 50px;">
      </div>
    </div>

    <div class="login-box relative z-10 w-full max-w-md">
      <div class="logo-section text-center mb-8">
        <div class="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-accent-500 to-primary-600 flex items-center justify-center shadow-glow">
          <Link2 class="w-10 h-10 text-white" />
        </div>
        <h1 class="text-2xl font-bold text-white mb-2">跨机房分布式节点</h1>
        <h2 class="text-xl font-bold bg-gradient-to-r from-accent-400 to-accent-500 bg-clip-text text-transparent">
          状态溯源系统
        </h2>
        <p class="text-dark-textSecondary mt-2 text-sm">实时监控 · 链路追踪 · 操作溯源</p>
      </div>

      <div class="bg-dark-card rounded-2xl border border-dark-border shadow-card overflow-hidden">
        <div class="flex border-b border-dark-border">
          <button
            :class="[
              'flex-1 py-4 text-sm font-medium transition-colors',
              activeTab === 'login' ? 'text-accent-400 border-b-2 border-accent-400 bg-accent-500/5' : 'text-dark-textSecondary hover:text-dark-text'
            ]"
            @click="activeTab = 'login'"
          >
            账号登录
          </button>
          <button
            :class="[
              'flex-1 py-4 text-sm font-medium transition-colors',
              activeTab === 'env' ? 'text-accent-400 border-b-2 border-accent-400 bg-accent-500/5' : 'text-dark-textSecondary hover:text-dark-text'
            ]"
            @click="activeTab = 'env'"
          >
            环境选择
          </button>
        </div>

        <div v-show="activeTab === 'login'" class="p-8">
          <div v-if="errorMsg" class="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg flex items-center gap-2 text-danger text-sm">
            <AlertCircle class="w-4 h-4 flex-shrink-0" />
            <span>{{ errorMsg }}</span>
          </div>

          <div class="mb-6 p-3 rounded-lg"
               :style="form.environment === 'production' ? 'background-color: rgba(255,23,68,0.1)' : 'background-color: rgba(0,212,255,0.1)'">
            <div class="flex items-center gap-2 text-sm">
              <span class="text-dark-textSecondary">当前环境:</span>
              <span :class="form.environment === 'production' ? 'text-danger' : 'text-accent-400'" class="font-medium">
                {{ form.environment === 'production' ? '生产环境' : '测试环境' }}
              </span>
              <button class="ml-auto text-xs text-dark-textSecondary hover:text-accent-400" @click="activeTab = 'env'">
                切换
              </button>
            </div>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-sm text-dark-textSecondary mb-2">用户名</label>
              <div class="relative">
                <User class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-textSecondary" />
                <input
                  v-model="form.username"
                  type="text"
                  placeholder="请输入用户名"
                  class="w-full pl-12 pr-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-textSecondary focus:outline-none focus:border-accent-500 transition-colors"
                  @keyup.enter="handleLogin"
                />
              </div>
            </div>

            <div>
              <label class="block text-sm text-dark-textSecondary mb-2">密码</label>
              <div class="relative">
                <Lock class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-textSecondary" />
                <input
                  v-model="form.password"
                  type="password"
                  placeholder="请输入密码"
                  class="w-full pl-12 pr-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-textSecondary focus:outline-none focus:border-accent-500 transition-colors"
                  @keyup.enter="handleLogin"
                />
              </div>
            </div>

            <button
              class="w-full py-3 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white font-medium rounded-lg transition-all duration-300 hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="loading"
              @click="handleLogin"
            >
              <span v-if="loading">登录中...</span>
              <span v-else>登 录</span>
            </button>
          </div>

          <div class="mt-6 pt-6 border-t border-dark-border">
            <p class="text-xs text-dark-textSecondary text-center mb-3">测试账号</p>
            <div class="grid grid-cols-3 gap-2 text-xs">
              <div class="p-2 bg-dark-bg rounded text-center">
                <div class="text-dark-text font-medium">admin</div>
                <div class="text-dark-textSecondary">管理员</div>
              </div>
              <div class="p-2 bg-dark-bg rounded text-center">
                <div class="text-dark-text font-medium">operator</div>
                <div class="text-dark-textSecondary">运维</div>
              </div>
              <div class="p-2 bg-dark-bg rounded text-center">
                <div class="text-dark-text font-medium">viewer</div>
                <div class="text-dark-textSecondary">只读</div>
              </div>
            </div>
            <p class="text-xs text-dark-textSecondary text-center mt-2">密码均为: admin123</p>
          </div>
        </div>

        <div v-show="activeTab === 'env'" class="p-8">
          <p class="text-sm text-dark-textSecondary mb-6 text-center">请选择要登录的环境</p>
          
          <div class="space-y-4">
            <div
              v-for="env in envOptions"
              :key="env.value"
              :class="[
                'p-4 rounded-xl border cursor-pointer transition-all duration-200',
                form.environment === env.value
                  ? 'border-accent-500/50 bg-accent-500/10'
                  : 'border-dark-border bg-dark-bg hover:border-accent-500/30'
              ]"
              @click="selectEnv(env.value as Environment)"
            >
              <div class="flex items-center gap-4">
                <div :class="['w-12 h-12 rounded-lg flex items-center justify-center', env.color]"
                     :style="form.environment === env.value ? 'background-color: currentColor; opacity: 0.2' : 'opacity: 0.2'">
                  <Link2 class="w-6 h-6" :class="env.color" style="opacity: 1" />
                </div>
                <div class="flex-1">
                  <div class="font-medium text-dark-text">{{ env.label }}</div>
                  <div class="text-sm text-dark-textSecondary">{{ env.desc }}</div>
                </div>
                <div v-if="form.environment === env.value" class="w-6 h-6 rounded-full bg-accent-500 flex items-center justify-center">
                  <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <button
            class="w-full mt-6 py-3 bg-dark-border hover:bg-dark-border/80 text-dark-text font-medium rounded-lg transition-colors"
            @click="activeTab = 'login'"
          >
            返回登录
          </button>
        </div>
      </div>

      <div class="text-center mt-6 text-xs text-dark-textSecondary">
        <p>© 2024 跨机房分布式节点状态溯源系统</p>
        <p class="mt-1">版本 v1.0.0</p>
      </div>
    </div>
  </div>
</template>
