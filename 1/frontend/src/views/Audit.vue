<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAuditLogs, getTraceDetail, getAuditStats } from '@/api/audit'
import type { AuditLog, TraceLink, PageQuery } from '@/types'
import {
  RefreshCw,
  Search,
  Filter,
  Download,
  Clock,
  User,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  ChevronDown,
  ChevronRight,
  GitBranch
} from 'lucide-vue-next'

const logs = ref<AuditLog[]>([])
const loading = ref(false)
const stats = ref<any>({})
const filters = ref({
  keyword: '',
  action: '',
  status: '',
  startTime: '',
  endTime: ''
})
const pagination = ref<PageQuery>({
  page: 1,
  pageSize: 20
})
const total = ref(0)
const expandedLog = ref<string | null>(null)
const traceDetail = ref<any[]>([])
const traceLoading = ref(false)
const showTraceDialog = ref(false)

const actionOptions = [
  { value: '', label: '全部操作' },
  { value: 'login', label: '用户登录' },
  { value: 'logout', label: '用户登出' },
  { value: 'node_start', label: '启动节点' },
  { value: 'node_stop', label: '停止节点' },
  { value: 'node_restart', label: '重启节点' },
  { value: 'collect_start', label: '启动采集' },
  { value: 'collect_pause', label: '暂停采集' },
  { value: 'user_create', label: '创建用户' },
  { value: 'user_update', label: '更新用户' },
  { value: 'user_delete', label: '删除用户' }
]

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' }
]

function getStatusIcon(status: string) {
  const icons: Record<string, any> = {
    success: CheckCircle,
    failed: XCircle,
    pending: Clock
  }
  return icons[status] || Info
}

function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    success: 'text-success',
    failed: 'text-danger',
    pending: 'text-warning'
  }
  return classes[status] || 'text-dark-textSecondary'
}

function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    success: '成功',
    failed: '失败',
    pending: '处理中'
  }
  return texts[status] || '未知'
}

function getActionText(action: string): string {
  const option = actionOptions.find(o => o.value === action)
  return option?.label || action
}

async function fetchStats() {
  try {
    const res = await getAuditStats()
    if (res.code === 200) {
      stats.value = res.data
    }
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

async function fetchLogs() {
  try {
    loading.value = true
    const params = {
      keyword: filters.value.keyword,
      action: filters.value.action,
      result: filters.value.status,
      startTime: filters.value.startTime,
      endTime: filters.value.endTime,
      ...pagination.value
    }
    const res = await getAuditLogs(params)
    if (res.code === 200) {
      logs.value = res.data.list || []
      total.value = res.data.total || 0
    }
  } catch (error) {
    console.error('获取审计日志失败:', error)
  } finally {
    loading.value = false
  }
}

async function viewTrace(log: AuditLog) {
  if (!log.traceId) return
  try {
    traceLoading.value = true
    showTraceDialog.value = true
    const res = await getTraceDetail(log.traceId)
    if (res.code === 200) {
      traceDetail.value = res.data || []
    }
  } catch (error) {
    console.error('获取链路详情失败:', error)
  } finally {
    traceLoading.value = false
  }
}

function toggleExpand(logId: string) {
  expandedLog.value = expandedLog.value === logId ? null : logId
}

function handleSearch() {
  pagination.value.page = 1
  fetchLogs()
}

function handleReset() {
  filters.value = {
    keyword: '',
    action: '',
    status: '',
    startTime: '',
    endTime: ''
  }
  pagination.value.page = 1
  fetchLogs()
}

function handlePageChange(page: number) {
  pagination.value.page = page
  fetchLogs()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function getServiceColor(service: string): string {
  const colors: Record<string, string> = {
    gateway: 'bg-accent-500',
    collector: 'bg-success',
    persistence: 'bg-warning',
    auth: 'bg-info'
  }
  return colors[service] || 'bg-dark-border'
}

onMounted(() => {
  fetchStats()
  fetchLogs()
})
</script>

<template>
  <div class="audit-page">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-xl font-bold text-dark-text">操作溯源</h2>
        <p class="text-sm text-dark-textSecondary mt-1">记录所有操作日志与全链路追踪</p>
      </div>
      <div class="flex gap-2">
        <button
          class="px-4 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-dark-text hover:border-accent-500/50 hover:text-accent-400 transition-colors flex items-center gap-2"
          @click="fetchLogs"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
          刷新
        </button>
        <button
          class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          <Download class="w-4 h-4" />
          导出日志
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-dark-card rounded-lg border border-dark-border p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-accent-500/10 flex items-center justify-center">
            <Activity class="w-6 h-6 text-accent-400" />
          </div>
          <div>
            <div class="text-2xl font-bold text-dark-text">{{ stats.todayTotal || 0 }}</div>
            <div class="text-sm text-dark-textSecondary">今日操作</div>
          </div>
        </div>
      </div>
      <div class="bg-dark-card rounded-lg border border-dark-border p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
            <CheckCircle class="w-6 h-6 text-success" />
          </div>
          <div>
            <div class="text-2xl font-bold text-success">{{ stats.todaySuccess || 0 }}</div>
            <div class="text-sm text-dark-textSecondary">成功</div>
          </div>
        </div>
      </div>
      <div class="bg-dark-card rounded-lg border border-dark-border p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-danger/10 flex items-center justify-center">
            <XCircle class="w-6 h-6 text-danger" />
          </div>
          <div>
            <div class="text-2xl font-bold text-danger">{{ stats.todayFailed || 0 }}</div>
            <div class="text-sm text-dark-textSecondary">失败</div>
          </div>
        </div>
      </div>
      <div class="bg-dark-card rounded-lg border border-dark-border p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
            <AlertTriangle class="w-6 h-6 text-warning" />
          </div>
          <div>
            <div class="text-2xl font-bold text-warning">{{ stats.totalTraces || 0 }}</div>
            <div class="text-sm text-dark-textSecondary">链路追踪</div>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-dark-card rounded-lg border border-dark-border p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <label class="block text-sm text-dark-textSecondary mb-2">关键词搜索</label>
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-textSecondary" />
            <input
              v-model="filters.keyword"
              type="text"
              placeholder="搜索操作内容、IP、Trace ID"
              class="w-full pl-10 pr-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text placeholder-dark-textSecondary/50 focus:outline-none focus:border-accent-500/50"
              @keyup.enter="handleSearch"
            />
          </div>
        </div>
        <div>
          <label class="block text-sm text-dark-textSecondary mb-2">操作类型</label>
          <select
            v-model="filters.action"
            class="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text focus:outline-none focus:border-accent-500/50"
          >
            <option v-for="opt in actionOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-dark-textSecondary mb-2">操作状态</label>
          <select
            v-model="filters.status"
            class="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text focus:outline-none focus:border-accent-500/50"
          >
            <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-dark-textSecondary mb-2">开始时间</label>
          <input
            v-model="filters.startTime"
            type="datetime-local"
            class="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text focus:outline-none focus:border-accent-500/50"
          />
        </div>
        <div>
          <label class="block text-sm text-dark-textSecondary mb-2">结束时间</label>
          <input
            v-model="filters.endTime"
            type="datetime-local"
            class="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text focus:outline-none focus:border-accent-500/50"
          />
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button
          class="px-4 py-2 bg-dark-border hover:bg-dark-border/80 text-dark-text text-sm rounded-lg transition-colors flex items-center gap-2"
          @click="handleReset"
        >
          <Filter class="w-4 h-4" />
          重置
        </button>
        <button
          class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
          @click="handleSearch"
        >
          <Search class="w-4 h-4" />
          查询
        </button>
      </div>
    </div>

    <div class="bg-dark-card rounded-lg border border-dark-border overflow-hidden">
      <el-table
        :data="logs"
        v-loading="loading"
        class="dark-table"
        :cell-style="{ color: '#E5E7EB', borderColor: '#374151' }"
        :header-cell-style="{ background: '#1F2937', color: '#9CA3AF', borderColor: '#374151' }"
      >
        <el-table-column width="50" align="center">
          <template #default="{ row }">
            <button
              class="p-1 hover:bg-dark-bg rounded transition-colors"
              @click="toggleExpand(row.id)"
            >
              <ChevronDown v-if="expandedLog === row.id" class="w-4 h-4 text-dark-textSecondary" />
              <ChevronRight v-else class="w-4 h-4 text-dark-textSecondary" />
            </button>
          </template>
        </el-table-column>
        <el-table-column width="80" label="状态" align="center">
          <template #default="{ row }">
            <component :is="getStatusIcon(row.status)" :class="['w-5 h-5', getStatusClass(row.status)]" />
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作类型" width="140">
          <template #default="{ row }">
            <span class="text-sm">{{ getActionText(row.action) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="操作内容" min-width="200">
          <template #default="{ row }">
            <span class="text-sm">{{ row.content }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" width="120">
          <template #default="{ row }">
            <span class="text-sm flex items-center gap-1">
              <User class="w-4 h-4 text-dark-textSecondary" />
              {{ row.operator }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP地址" width="130">
          <template #default="{ row }">
            <span class="text-sm font-mono">{{ row.ip }}</span>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="100" align="center">
          <template #default="{ row }">
            <span class="text-sm font-mono">{{ formatDuration(row.duration || 0) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="操作时间" width="180">
          <template #default="{ row }">
            <span class="text-sm text-dark-textSecondary flex items-center gap-1">
              <Clock class="w-4 h-4" />
              {{ row.createdAt }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center">
          <template #default="{ row }">
            <button
              v-if="row.traceId"
              class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1 mx-auto"
              @click="viewTrace(row)"
            >
              <GitBranch class="w-3 h-3" />
              链路追踪
            </button>
          </template>
        </el-table-column>

        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="p-4 bg-dark-bg rounded-lg">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-dark-textSecondary">Trace ID:</span>
                  <span class="font-mono ml-2">{{ row.traceId || '-' }}</span>
                </div>
                <div>
                  <span class="text-dark-textSecondary">User Agent:</span>
                  <span class="ml-2">{{ row.userAgent || '-' }}</span>
                </div>
                <div>
                  <span class="text-dark-textSecondary">请求参数:</span>
                  <pre class="mt-2 p-3 bg-dark-card rounded font-mono text-xs overflow-auto max-h-40">{{ JSON.stringify(row.requestParams, null, 2) || '{}' }}</pre>
                </div>
                <div>
                  <span class="text-dark-textSecondary">响应结果:</span>
                  <pre class="mt-2 p-3 bg-dark-card rounded font-mono text-xs overflow-auto max-h-40">{{ JSON.stringify(row.responseData, null, 2) || '{}' }}</pre>
                </div>
                <div v-if="row.errorMessage" class="md:col-span-2">
                  <span class="text-danger">错误信息:</span>
                  <pre class="mt-2 p-3 bg-dark-card rounded font-mono text-xs text-danger overflow-auto max-h-40">{{ row.errorMessage }}</pre>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="flex items-center justify-between px-6 py-4 border-t border-dark-border">
        <div class="text-sm text-dark-textSecondary">
          共 {{ total }} 条记录
        </div>
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="prev, pager, next, jumper, sizes"
          background
          @current-change="handlePageChange"
        />
      </div>
    </div>

    <el-dialog
      v-model="showTraceDialog"
      title="全链路追踪"
      width="900px"
      :close-on-click-modal="false"
    >
      <div class="trace-detail">
        <div v-if="traceLoading" class="text-center py-8">
          <el-skeleton :rows="5" animated />
        </div>
        <div v-else-if="traceDetail.length === 0" class="text-center py-8 text-dark-textSecondary">
          暂无链路数据
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="(span, index) in traceDetail"
            :key="span.spanId"
            class="flex gap-4"
          >
            <div class="flex flex-col items-center">
              <div :class="['w-3 h-3 rounded-full', getServiceColor(span.service)]"></div>
              <div v-if="index < traceDetail.length - 1" class="w-0.5 h-full bg-dark-border mt-1"></div>
            </div>
            <div class="flex-1 bg-dark-bg rounded-lg p-4 mb-2">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                  <span :class="['px-2 py-0.5 rounded text-xs text-white', getServiceColor(span.service)]">
                    {{ span.service }}
                  </span>
                  <span class="font-medium text-dark-text">{{ span.name }}</span>
                </div>
                <span class="text-sm font-mono text-dark-textSecondary">{{ formatDuration(span.duration) }}</span>
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span class="text-dark-textSecondary">Span ID:</span>
                  <span class="font-mono ml-1">{{ span.spanId }}</span>
                </div>
                <div>
                  <span class="text-dark-textSecondary">父Span:</span>
                  <span class="font-mono ml-1">{{ span.parentSpanId || '根节点' }}</span>
                </div>
                <div class="col-span-2">
                  <span class="text-dark-textSecondary">时间:</span>
                  <span class="ml-1">{{ span.startTime }} ~ {{ span.endTime }}</span>
                </div>
                <div v-if="span.tags" class="col-span-2">
                  <span class="text-dark-textSecondary">标签:</span>
                  <span class="ml-1">{{ JSON.stringify(span.tags) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="showTraceDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts">
import { ElMessage, ElTable, ElTableColumn, ElPagination, ElDialog, ElSkeleton } from 'element-plus'

export default {
  components: {
    ElMessage,
    ElTable,
    ElTableColumn,
    ElPagination,
    ElDialog,
    ElSkeleton
  }
}
</script>
