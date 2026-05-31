
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import api from '../api'
import type { DeployEnvironment, LinkageRule } from '../types'

const currentEnvironment = ref<DeployEnvironment>('nearshore')
const linkageRules = ref<LinkageRule[]>([])
const systemInfo = ref({
  version: '1.0.0',
  uptime: '0h 0m',
  dataPoints: 0,
})

const envLabels: Record<DeployEnvironment, { label: string; description: string; color: string }> = {
  nearshore: {
    label: '近海模式',
    description: '适用于近海航行，数据更新频率高，保留30天数据',
    color: 'text-cyan-400',
  },
  offshore: {
    label: '远海模式',
    description: '适用于远海航行，优化带宽使用，保留90天数据',
    color: 'text-blue-400',
  },
}

const switchEnvironment = (env: DeployEnvironment) => {
  currentEnvironment.value = env
}

const toggleLinkageRule = (ruleId: string) => {
  const rule = linkageRules.value.find(r => r.id === ruleId)
  if (rule) {
    rule.enabled = !rule.enabled
  }
}

onMounted(async () => {
  try {
    const health = await api.health.check()
    currentEnvironment.value = health.environment as DeployEnvironment || 'nearshore'
    
    const linkageRes = await api.linkage.getAll()
    linkageRules.value = linkageRes.rules
  } catch (error) {
    console.error('加载系统信息失败:', error)
  }
})
</script>

<template>
  <div class="min-h-screen bg-slate-900 p-6">
    <div class="max-w-4xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-white">系统设置</h1>
        <p class="text-slate-400 mt-1">配置系统运行参数和联动规则</p>
      </div>

      <div class="space-y-6">
        <div class="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-6">
          <h2 class="text-lg font-semibold text-white mb-4">部署环境</h2>
          <p class="text-sm text-slate-400 mb-4">根据船舶航行位置选择合适的部署模式</p>
          
          <div class="grid grid-cols-2 gap-4">
            <button 
              @click="switchEnvironment('nearshore')"
              class="p-4 rounded-xl border-2 text-left transition-all"
              :class="currentEnvironment === 'nearshore' 
                ? 'border-cyan-500 bg-cyan-500/10' 
                : 'border-slate-600 hover:border-slate-500 bg-slate-700/20'"
            >
              <div class="flex items-center gap-3 mb-2">
                <svg class="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span class="font-semibold text-white">近海模式</span>
              </div>
              <p class="text-sm text-slate-400">数据更新频率: 1秒</p>
              <p class="text-sm text-slate-400">数据保留: 30天</p>
            </button>

            <button 
              @click="switchEnvironment('offshore')"
              class="p-4 rounded-xl border-2 text-left transition-all"
              :class="currentEnvironment === 'offshore' 
                ? 'border-blue-500 bg-blue-500/10' 
                : 'border-slate-600 hover:border-slate-500 bg-slate-700/20'"
            >
              <div class="flex items-center gap-3 mb-2">
                <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="font-semibold text-white">远海模式</span>
              </div>
              <p class="text-sm text-slate-400">数据更新频率: 3秒</p>
              <p class="text-sm text-slate-400">数据保留: 90天</p>
            </button>
          </div>
        </div>

        <div class="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-lg font-semibold text-white">联动规则</h2>
              <p class="text-sm text-slate-400">配置传感器数据触发的设备自动控制</p>
            </div>
          </div>

          <div class="space-y-3">
            <div 
              v-for="rule in linkageRules" 
              :key="rule.id"
              class="p-4 bg-slate-700/30 rounded-lg"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <h3 class="font-medium text-white">{{ rule.name }}</h3>
                    <span 
                      class="px-2 py-0.5 text-xs rounded"
                      :class="rule.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'"
                    >
                      {{ rule.enabled ? '已启用' : '已禁用' }}
                    </span>
                  </div>
                  <p class="text-sm text-slate-400 mt-1">{{ rule.description }}</p>
                  <p class="text-xs text-slate-500 mt-2">
                    条件: 传感器值 {{ rule.condition.operator }} {{ rule.condition.value }} 
                    → {{ rule.action.command === 'turnOn' ? '开启' : rule.action.command === 'turnOff' ? '关闭' : '设置' }} 设备
                    {{ rule.action.value ? ` 至 ${rule.action.value}%` : '' }}
                  </p>
                </div>
                <button 
                  @click="toggleLinkageRule(rule.id)"
                  class="relative w-12 h-6 rounded-full transition-colors"
                  :class="rule.enabled ? 'bg-green-500' : 'bg-slate-600'"
                >
                  <span 
                    class="absolute top-1 w-4 h-4 bg-white rounded-full transition-transform"
                    :class="rule.enabled ? 'translate-x-7' : 'translate-x-1'"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-6">
          <h2 class="text-lg font-semibold text-white mb-4">系统信息</h2>
          <div class="grid grid-cols-3 gap-4">
            <div class="p-4 bg-slate-700/30 rounded-lg">
              <p class="text-sm text-slate-400">系统版本</p>
              <p class="text-lg font-mono text-white mt-1">{{ systemInfo.version }}</p>
            </div>
            <div class="p-4 bg-slate-700/30 rounded-lg">
              <p class="text-sm text-slate-400">运行环境</p>
              <p class="text-lg font-medium mt-1" :class="envLabels[currentEnvironment].color">
                {{ envLabels[currentEnvironment].label }}
              </p>
            </div>
            <div class="p-4 bg-slate-700/30 rounded-lg">
              <p class="text-sm text-slate-400">数据采集点</p>
              <p class="text-lg font-mono text-white mt-1">13 传感器</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
