<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getStatsApi, listDocumentsApi, getSearchHistoryApi } from '@/utils/api'
import { FileText, Database, Search, Users } from 'lucide-vue-next'

const stats = ref({ document_count: 0, vector_count: 0, query_count: 0, active_users: 0 })
const recentDocs = ref<any[]>([])
const recentSearches = ref<any[]>([])
const loading = ref(true)

const statCards = [
  { key: 'document_count', label: '文档总数', icon: FileText, color: 'blue' },
  { key: 'vector_count', label: '向量数量', icon: Database, color: 'indigo' },
  { key: 'query_count', label: '本月查询', icon: Search, color: 'amber' },
  { key: 'active_users', label: '活跃用户', icon: Users, color: 'emerald' },
] as const

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

onMounted(async () => {
  try {
    const [statsRes, docsRes, searchRes] = await Promise.all([
      getStatsApi(),
      listDocumentsApi(1, 5),
      getSearchHistoryApi(1, 5),
    ])
    stats.value = statsRes
    recentDocs.value = docsRes.items
    recentSearches.value = searchRes.items
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        v-for="card in statCards"
        :key="card.key"
        class="card flex items-center gap-4"
      >
        <div :class="[colorMap[card.color].bg, colorMap[card.color].border, 'p-3 rounded-xl border']">
          <component :is="card.icon" :class="[colorMap[card.color].text, 'w-6 h-6']" />
        </div>
        <div>
          <p class="text-sm text-slate-400">{{ card.label }}</p>
          <p class="text-2xl font-bold text-white">
            {{ loading ? '...' : (stats as any)[card.key]?.toLocaleString() }}
          </p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card">
        <h3 class="text-lg font-semibold text-white mb-4">最近上传的文档</h3>
        <div v-if="recentDocs.length === 0" class="text-center py-8 text-slate-500">暂无文档</div>
        <div v-else class="space-y-3">
          <div
            v-for="doc in recentDocs"
            :key="doc.id"
            class="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
          >
            <div class="flex items-center gap-3">
              <FileText class="w-4 h-4 text-blue-400" />
              <div>
                <p class="text-sm font-medium text-slate-200">{{ doc.filename }}</p>
                <p class="text-xs text-slate-500">{{ formatFileSize(doc.file_size) }}</p>
              </div>
            </div>
            <span :class="doc.status === 'completed' ? 'badge-success' : doc.status === 'failed' ? 'badge-error' : 'badge-warning'">
              {{ doc.status === 'completed' ? '已完成' : doc.status === 'failed' ? '失败' : '处理中' }}
            </span>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold text-white mb-4">最近检索记录</h3>
        <div v-if="recentSearches.length === 0" class="text-center py-8 text-slate-500">暂无检索记录</div>
        <div v-else class="space-y-3">
          <div
            v-for="search in recentSearches"
            :key="search.id"
            class="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
          >
            <div class="flex items-center gap-3">
              <Search class="w-4 h-4 text-amber-400" />
              <p class="text-sm text-slate-200 truncate max-w-xs">{{ search.query }}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-slate-400">{{ search.result_count }} 条结果</p>
              <p class="text-xs text-slate-500">{{ formatDate(search.created_at) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
