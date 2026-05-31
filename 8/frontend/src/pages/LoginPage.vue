<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { BookOpen, Eye, EyeOff } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await authStore.login(username.value, password.value)
    router.push('/dashboard')
  } catch (e: any) {
    error.value = e.message || '登录失败，请检查用户名和密码'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 relative overflow-hidden">
    <div class="absolute inset-0 opacity-30">
      <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"></div>
      <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl"></div>
    </div>

    <div class="relative w-full max-w-md px-6">
      <div class="backdrop-blur-xl bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
        <div class="flex items-center justify-center gap-3 mb-8">
          <BookOpen class="w-10 h-10 text-blue-400" />
          <div>
            <h1 class="text-2xl font-bold text-white">DocuSem AI</h1>
            <p class="text-sm text-slate-400">私有化文档语义检索平台</p>
          </div>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">用户名</label>
            <input
              v-model="username"
              type="text"
              placeholder="请输入用户名"
              class="input-field"
              autocomplete="username"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">密码</label>
            <div class="relative">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="请输入密码"
                class="input-field pr-10"
                autocomplete="current-password"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <Eye v-if="!showPassword" class="w-4 h-4" />
                <EyeOff v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div v-if="error" class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {{ error }}
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ loading ? '登录中...' : '登 录' }}
          </button>
        </form>

        <p class="text-center text-xs text-slate-500 mt-6">
          默认管理员: admin / admin123
        </p>
      </div>
    </div>
  </div>
</template>
