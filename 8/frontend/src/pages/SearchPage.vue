<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { searchApi, getSearchHistoryApi } from '@/utils/api'
import { Search, FileText, Clock, ChevronDown, ChevronUp, ExternalLink } from 'lucide-vue-next'

const router = useRouter()

const query = ref('')
const topK = ref(5)
const threshold = ref(0.3)
const showAdvanced = ref(false)
const results = ref<any[]>([])
const searching = ref(false)
const hasSearched = ref(false)
const expandedChunks = ref<Set<string>>(new Set())

const history = ref<any[]>([])
const historyTotal = ref(0)

async function handleSearch() {
  if (!query.value.trim()) return
  searching.value = true
  hasSearched.value = true
  try {
    const res = await searchApi(query.value, topK.value, threshold.value)
    results.value = res.results
    fetchHistory()
  } catch (e: any) {
    console.error(e)
  } finally {
    searching.value = false
  }
}

async function fetchHistory() {
  try {
    const res = await getSearchHistoryApi(1, 10)
    history.value = res.items
    historyTotal.value = res.total
  } catch (e) {
    console.error(e)
  }
}

function toggleChunk(id: string) {
  if (expandedChunks.value.has(id)) {
    expandedChunks.value.delete(id)
  } else {
    expandedChunks.value.add(id)
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

function scoreColor(score: number) {
  if (score >= 0.8) return 'text-emerald-400'
  if (score >= 0.6) return 'text-amber-400'
  return 'text-red-400'
}

function goToDocument(docId: string) {
  router.push({ path: '/documents', query: { highlight: docId } })
}

fetchHistory()
</script>

<template>
  <div class="space-y-6">
    <div class="card">
      <div class="relative">
        <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          v-model="query"
          placeholder="输入自然语言查询，如：项目部署流程是什么？"
          class="input-field pl-12 py-3.5 text-base"
          @keyup.enter="handleSearch"
        />
      </div>

      <div class="mt-3 flex items-center justify-between">
        <button @click="showAdvanced = !showAdvanced" class="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <component :is="showAdvanced ? ChevronUp : ChevronDown" class="w-4 h-4" />
          高级参数
        </button>
        <button @click="handleSearch" :disabled="searching || !query.trim()" class="btn-primary disabled:opacity-50">
          {{ searching ? '检索中...' : '语义检索' }}
        </button>
      </div>

      <div v-if="showAdvanced" class="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-slate-400 mb-1">返回数量 (Top-K)</label>
          <input v-model.number="topK" type="number" min="1" max="20" class="input-field" />
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">相似度阈值</label>
          <input v-model.number="threshold" type="number" min="0" max="1" step="0.05" class="input-field" />
        </div>
      </div>
    </div>

    <div v-if="hasSearched" class="space-y-3">
      <h3 class="text-sm text-slate-400">
        检索结果（{{ results.length }} 条匹配）
      </h3>
      <div v-if="results.length === 0" class="card text-center py-8 text-slate-500">
        未找到相关文档片段，尝试降低相似度阈值或修改查询词
      </div>
      <div
        v-for="result in results"
        :key="result.chunk_id"
        class="card hover:border-blue-500/30 transition-colors"
      >
        <div class="flex items-start justify-between gap-4 mb-2">
          <div
            class="flex items-center gap-2 cursor-pointer group/doc hover:text-blue-300 transition-colors"
            @click="goToDocument(result.document_id)"
          >
            <FileText class="w-4 h-4 text-blue-400 shrink-0" />
            <span class="text-sm font-medium text-blue-400 group-hover/doc:text-blue-300 transition-colors">{{ result.filename }}</span>
            <ExternalLink class="w-3.5 h-3.5 text-slate-500 group-hover/doc:text-blue-400 transition-colors" />
            <span v-if="result.page_number" class="badge-info">第 {{ result.page_number }} 页</span>
          </div>
          <span :class="[scoreColor(result.score), 'text-sm font-bold']">
            {{ (result.score * 100).toFixed(1) }}%
          </span>
        </div>
        <p
          :class="[
            'text-sm text-slate-300 leading-relaxed',
            !expandedChunks.has(result.chunk_id) ? 'line-clamp-3' : '',
          ]"
        >
          {{ result.content }}
        </p>
        <div class="flex items-center gap-4 mt-2">
          <button
            @click="toggleChunk(result.chunk_id)"
            class="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {{ expandedChunks.has(result.chunk_id) ? '收起' : '展开全文' }}
          </button>
          <button
            @click="goToDocument(result.document_id)"
            class="text-xs text-slate-400 hover:text-blue-400 transition-colors flex items-center gap-1"
          >
            <ExternalLink class="w-3 h-3" />
            查看文档详情
          </button>
        </div>
      </div>
    </div>

    <div v-if="history.length > 0" class="card">
      <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Clock class="w-5 h-5 text-slate-400" />
        检索历史
      </h3>
      <div class="space-y-2">
        <div
          v-for="item in history"
          :key="item.id"
          @click="query = item.query"
          class="flex items-center justify-between p-2.5 bg-slate-700/30 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors"
        >
          <span class="text-sm text-slate-300 truncate max-w-md">{{ item.query }}</span>
          <span class="text-xs text-slate-500">{{ item.result_count }} 条 · {{ formatDate(item.created_at) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
