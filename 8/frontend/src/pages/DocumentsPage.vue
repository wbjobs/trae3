<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  uploadDocumentApi, listDocumentsApi, deleteDocumentApi, reparseDocumentApi,
} from '@/utils/api'
import { Upload, FileText, Trash2, RefreshCw, Search, X, FileUp, Eye } from 'lucide-vue-next'

const route = useRoute()
const documents = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const loading = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const dragOver = ref(false)
const highlightDocId = ref<string | null>(null)

watch(() => route.query.highlight, (newHighlight) => {
  if (newHighlight) {
    highlightDocId.value = newHighlight as string
  }
}, { immediate: true })

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

async function fetchDocuments() {
  loading.value = true
  try {
    const res = await listDocumentsApi(page.value, pageSize.value, keyword.value || undefined)
    documents.value = res.items
    total.value = res.total
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  await uploadFiles(Array.from(input.files!))
  input.value = ''
}

async function uploadFiles(files: File[]) {
  uploading.value = true
  for (const file of files) {
    try {
      await uploadDocumentApi(file)
    } catch (e: any) {
      alert(`上传失败: ${file.name} - ${e.message}`)
    }
  }
  uploading.value = false
  fetchDocuments()
}

async function handleDelete(id: string) {
  if (!confirm('确定删除该文档？')) return
  try {
    await deleteDocumentApi(id)
    fetchDocuments()
  } catch (e: any) {
    alert(`删除失败: ${e.message}`)
  }
}

async function handleReparse(id: string) {
  try {
    await reparseDocumentApi(id)
    fetchDocuments()
  } catch (e: any) {
    alert(`重新解析失败: ${e.message}`)
  }
}

function handleDrop(e: DragEvent) {
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (files?.length) {
    uploadFiles(Array.from(files))
  }
}

onMounted(fetchDocuments)
</script>

<template>
  <div class="space-y-6">
    <div
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="handleDrop"
      :class="[
        'border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300',
        dragOver
          ? 'border-blue-400 bg-blue-500/5'
          : 'border-slate-600 hover:border-slate-500 bg-slate-800/30',
      ]"
    >
      <FileUp :class="['w-12 h-12 mx-auto mb-3', dragOver ? 'text-blue-400' : 'text-slate-500']" />
      <p class="text-slate-300 mb-2">拖拽文件到此处上传，或点击选择文件</p>
      <p class="text-xs text-slate-500 mb-4">支持 PDF、Word (.docx)、TXT、Markdown 格式</p>
      <label class="btn-primary inline-flex items-center gap-2 cursor-pointer">
        <Upload class="w-4 h-4" />
        <span>{{ uploading ? '上传中...' : '选择文件' }}</span>
        <input type="file" class="hidden" multiple accept=".pdf,.docx,.txt,.md" @change="handleUpload" :disabled="uploading" />
      </label>
    </div>

    <div class="flex items-center gap-4">
      <div class="flex-1 relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          v-model="keyword"
          placeholder="搜索文档..."
          class="input-field pl-10"
          @keyup.enter="page = 1; fetchDocuments()"
        />
      </div>
      <button v-if="keyword" @click="keyword = ''; page = 1; fetchDocuments()" class="btn-secondary">
        <X class="w-4 h-4" />
      </button>
    </div>

    <div class="card overflow-hidden p-0">
      <table class="w-full">
        <thead>
          <tr class="border-b border-slate-700/50 bg-slate-800/50">
            <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">文件名</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">类型</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">大小</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">分块数</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">状态</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">上传时间</th>
            <th class="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="7" class="text-center py-8 text-slate-400">加载中...</td>
          </tr>
          <tr v-else-if="documents.length === 0">
            <td colspan="7" class="text-center py-8 text-slate-500">暂无文档，请上传</td>
          </tr>
          <tr
            v-for="doc in documents"
            :key="doc.id"
            :class="[
              'border-b border-slate-700/30 hover:bg-slate-800/30 transition-all duration-300',
              highlightDocId === doc.id ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : '',
            ]"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <FileText class="w-4 h-4 text-blue-400 shrink-0" />
                <span class="text-sm text-slate-200 truncate max-w-xs">{{ doc.filename }}</span>
                <span v-if="highlightDocId === doc.id" class="badge-info text-[10px]">定位</span>
              </div>
            </td>
            <td class="px-4 py-3 text-sm text-slate-400">{{ doc.file_type }}</td>
            <td class="px-4 py-3 text-sm text-slate-400">{{ formatFileSize(doc.file_size) }}</td>
            <td class="px-4 py-3 text-sm text-slate-400">{{ doc.chunk_count }}</td>
            <td class="px-4 py-3">
              <span :class="doc.status === 'completed' ? 'badge-success' : doc.status === 'failed' ? 'badge-error' : 'badge-warning'">
                {{ doc.status === 'completed' ? '已完成' : doc.status === 'failed' ? '失败' : '处理中' }}
              </span>
            </td>
            <td class="px-4 py-3 text-sm text-slate-500">{{ formatDate(doc.created_at) }}</td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-2">
                <button @click="handleReparse(doc.id)" class="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors" title="重新解析">
                  <RefreshCw class="w-4 h-4" />
                </button>
                <button @click="handleDelete(doc.id)" class="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="删除">
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between">
      <p class="text-sm text-slate-400">共 {{ total }} 条记录</p>
      <div class="flex items-center gap-2">
        <button
          :disabled="page <= 1"
          @click="page--; fetchDocuments()"
          class="btn-secondary text-sm disabled:opacity-50"
        >上一页</button>
        <span class="text-sm text-slate-400">{{ page }} / {{ Math.ceil(total / pageSize) || 1 }}</span>
        <button
          :disabled="page >= Math.ceil(total / pageSize)"
          @click="page++; fetchDocuments()"
          class="btn-secondary text-sm disabled:opacity-50"
        >下一页</button>
      </div>
    </div>
  </div>
</template>
