<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useUserStore } from '@/store/user'
import {
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Bell,
  AlertTriangle,
  Cpu,
  MemoryStick,
  HardDrive,
  Server,
  ToggleLeft,
  ToggleRight,
  Mail,
  MessageSquare,
  Phone
} from 'lucide-vue-next'

const userStore = useUserStore()

const alarmRules = ref<any[]>([])
const loading = ref(false)
const showDialog = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const currentRule = ref<any>(null)

const metricOptions = [
  { value: 'cpu', label: 'CPU使用率', icon: Cpu },
  { value: 'memory', label: '内存使用率', icon: MemoryStick },
  { value: 'disk', label: '磁盘使用率', icon: HardDrive },
  { value: 'network', label: '网络流量', icon: Server },
  { value: 'status', label: '节点状态', icon: AlertTriangle }
]

const operatorOptions = [
  { value: 'gt', label: '大于 (>)' },
  { value: 'gte', label: '大于等于 (>=)' },
  { value: 'lt', label: '小于 (<)' },
  { value: 'lte', label: '小于等于 (<=)' },
  { value: 'eq', label: '等于 (=)' },
  { value: 'neq', label: '不等于 (!=)' }
]

const levelOptions = [
  { value: 'info', label: '提示', color: 'bg-info/20 text-info' },
  { value: 'warning', label: '警告', color: 'bg-warning/20 text-warning' },
  { value: 'critical', label: '严重', color: 'bg-danger/20 text-danger' }
]

const notifyTypeOptions = [
  { value: 'email', label: '邮件', icon: Mail },
  { value: 'sms', label: '短信', icon: MessageSquare },
  { value: 'phone', label: '电话', icon: Phone }
]

const formData = ref({
  name: '',
  metric: 'cpu',
  operator: 'gt',
  threshold: 80,
  duration: 5,
  level: 'warning',
  enabled: true,
  notifyTypes: ['email'],
  notifyUsers: ['admin@example.com'],
  description: ''
})

const formRules = {
  name: [
    { required: true, message: '请输入规则名称', trigger: 'blur' }
  ],
  threshold: [
    { required: true, message: '请输入阈值', trigger: 'blur' }
  ]
}

function getMetricInfo(value: string) {
  return metricOptions.find(o => o.value === value) || metricOptions[0]
}

function getLevelInfo(value: string) {
  return levelOptions.find(o => o.value === value) || levelOptions[1]
}

function getOperatorText(value: string): string {
  const option = operatorOptions.find(o => o.value === value)
  return option?.label || value
}

function generateMockRules() {
  return [
    {
      id: 1,
      name: 'CPU使用率过高告警',
      metric: 'cpu',
      operator: 'gt',
      threshold: 85,
      duration: 5,
      level: 'warning',
      enabled: true,
      notifyTypes: ['email', 'sms'],
      notifyUsers: ['admin@example.com'],
      triggeredCount: 12,
      lastTriggered: '2024-01-15 09:30:00',
      createdAt: '2023-01-01 00:00:00'
    },
    {
      id: 2,
      name: '内存使用率过高告警',
      metric: 'memory',
      operator: 'gt',
      threshold: 90,
      duration: 10,
      level: 'critical',
      enabled: true,
      notifyTypes: ['email', 'phone'],
      notifyUsers: ['admin@example.com', 'op1@example.com'],
      triggeredCount: 5,
      lastTriggered: '2024-01-14 16:45:00',
      createdAt: '2023-01-01 00:00:00'
    },
    {
      id: 3,
      name: '磁盘使用率过高告警',
      metric: 'disk',
      operator: 'gt',
      threshold: 80,
      duration: 15,
      level: 'warning',
      enabled: true,
      notifyTypes: ['email'],
      notifyUsers: ['admin@example.com'],
      triggeredCount: 3,
      lastTriggered: '2024-01-10 14:20:00',
      createdAt: '2023-06-01 10:00:00'
    },
    {
      id: 4,
      name: '节点离线告警',
      metric: 'status',
      operator: 'eq',
      threshold: 0,
      duration: 2,
      level: 'critical',
      enabled: true,
      notifyTypes: ['email', 'sms', 'phone'],
      notifyUsers: ['admin@example.com', 'op1@example.com', 'op2@example.com'],
      triggeredCount: 0,
      lastTriggered: '-',
      createdAt: '2023-06-01 10:00:00'
    },
    {
      id: 5,
      name: '网络流量异常告警',
      metric: 'network',
      operator: 'gt',
      threshold: 1000,
      duration: 5,
      level: 'info',
      enabled: false,
      notifyTypes: ['email'],
      notifyUsers: ['admin@example.com'],
      triggeredCount: 0,
      lastTriggered: '-',
      createdAt: '2023-10-01 09:00:00'
    }
  ]
}

async function fetchRules() {
  try {
    loading.value = true
    await new Promise(resolve => setTimeout(resolve, 500))
    alarmRules.value = generateMockRules()
  } catch (error) {
    console.error('获取告警规则失败:', error)
  } finally {
    loading.value = false
  }
}

function handleCreate() {
  dialogMode.value = 'create'
  currentRule.value = null
  formData.value = {
    name: '',
    metric: 'cpu',
    operator: 'gt',
    threshold: 80,
    duration: 5,
    level: 'warning',
    enabled: true,
    notifyTypes: ['email'],
    notifyUsers: ['admin@example.com'],
    description: ''
  }
  showDialog.value = true
}

function handleEdit(rule: any) {
  dialogMode.value = 'edit'
  currentRule.value = rule
  formData.value = { ...rule }
  showDialog.value = true
}

async function handleDelete(rule: any) {
  try {
    await ElMessageBox.confirm(
      `确定要删除告警规则 "${rule.name}" 吗？`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    ElMessage.success('删除成功')
    fetchRules()
  } catch {
  }
}

async function toggleEnabled(rule: any) {
  rule.enabled = !rule.enabled
  ElMessage.success(`${rule.enabled ? '启用' : '禁用'}成功`)
}

async function handleSubmit() {
  try {
    if (dialogMode.value === 'create') {
      ElMessage.success('创建告警规则成功')
    } else {
      ElMessage.success('更新告警规则成功')
    }
    showDialog.value = false
    fetchRules()
  } catch (error) {
    console.error('提交失败:', error)
  }
}

const stats = computed(() => {
  const total = alarmRules.value.length
  const enabled = alarmRules.value.filter(r => r.enabled).length
  const triggered = alarmRules.value.reduce((sum, r) => sum + r.triggeredCount, 0)
  const critical = alarmRules.value.filter(r => r.enabled && r.level === 'critical').length
  return { total, enabled, triggered, critical }
})

onMounted(() => {
  fetchRules()
})
</script>

<template>
  <div class="settings-alarm-page">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-dark-bg rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-accent-500/10 flex items-center justify-center">
            <Bell class="w-6 h-6 text-accent-400" />
          </div>
          <div>
            <div class="text-2xl font-bold text-dark-text">{{ stats.total }}</div>
            <div class="text-sm text-dark-textSecondary">总规则数</div>
          </div>
        </div>
      </div>
      <div class="bg-dark-bg rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
            <ToggleRight class="w-6 h-6 text-success" />
          </div>
          <div>
            <div class="text-2xl font-bold text-success">{{ stats.enabled }}</div>
            <div class="text-sm text-dark-textSecondary">已启用</div>
          </div>
        </div>
      </div>
      <div class="bg-dark-bg rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
            <AlertTriangle class="w-6 h-6 text-warning" />
          </div>
          <div>
            <div class="text-2xl font-bold text-warning">{{ stats.triggered }}</div>
            <div class="text-sm text-dark-textSecondary">触发次数</div>
          </div>
        </div>
      </div>
      <div class="bg-dark-bg rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-danger/10 flex items-center justify-center">
            <AlertTriangle class="w-6 h-6 text-danger" />
          </div>
          <div>
            <div class="text-2xl font-bold text-danger">{{ stats.critical }}</div>
            <div class="text-sm text-dark-textSecondary">严重级别</div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex items-center justify-between mb-6">
      <div></div>
      <div class="flex gap-2">
        <button
          class="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text hover:border-accent-500/50 hover:text-accent-400 transition-colors flex items-center gap-2"
          @click="fetchRules"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
          刷新
        </button>
        <button
          v-if="userStore.hasPermission('alarm:create')"
          class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
          @click="handleCreate"
        >
          <Plus class="w-4 h-4" />
          新增规则
        </button>
      </div>
    </div>

    <el-table
      :data="alarmRules"
      v-loading="loading"
      class="dark-table"
      :cell-style="{ color: '#E5E7EB', borderColor: '#374151' }"
      :header-cell-style="{ background: '#1F2937', color: '#9CA3AF', borderColor: '#374151' }"
    >
      <el-table-column width="80" label="状态" align="center">
        <template #default="{ row }">
          <button
            class="p-1 transition-colors"
            @click="toggleEnabled(row)"
          >
            <ToggleRight v-if="row.enabled" class="w-6 h-6 text-success" />
            <ToggleLeft v-else class="w-6 h-6 text-dark-textSecondary" />
          </button>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="规则名称" min-width="180">
        <template #default="{ row }">
          <div class="flex items-center gap-2">
            <component :is="getMetricInfo(row.metric).icon" class="w-5 h-5 text-accent-400" />
            <span class="font-medium">{{ row.name }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="告警条件" min-width="200">
        <template #default="{ row }">
          <span class="text-sm">
            {{ getMetricInfo(row.metric).label }}
            {{ getOperatorText(row.operator) }}
            <span class="text-accent-400 font-mono font-bold">{{ row.threshold }}</span>
            <span v-if="row.metric !== 'status'" class="text-dark-textSecondary">%</span>
            <span class="text-dark-textSecondary"> 持续 </span>
            <span class="text-warning font-mono">{{ row.duration }}</span>
            <span class="text-dark-textSecondary">分钟</span>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="级别" width="100">
        <template #default="{ row }">
          <span :class="['px-2 py-1 rounded text-xs', getLevelInfo(row.level).color]">
            {{ getLevelInfo(row.level).label }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="通知方式" width="150">
        <template #default="{ row }">
          <div class="flex items-center gap-2">
            <component
              v-for="type in row.notifyTypes"
              :key="type"
              :is="notifyTypeOptions.find(o => o.value === type)?.icon"
              class="w-4 h-4 text-dark-textSecondary"
              :title="notifyTypeOptions.find(o => o.value === type)?.label"
            />
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="triggeredCount" label="触发次数" width="100" align="center">
        <template #default="{ row }">
          <span :class="row.triggeredCount > 0 ? 'text-warning' : 'text-dark-textSecondary'">
            {{ row.triggeredCount }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="lastTriggered" label="最后触发" width="180">
        <template #default="{ row }">
          <span class="text-sm text-dark-textSecondary">{{ row.lastTriggered }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="center">
        <template #default="{ row }">
          <div class="flex items-center justify-center gap-2">
            <button
              v-if="userStore.hasPermission('alarm:update')"
              class="p-1.5 text-accent-400 hover:text-accent-300 hover:bg-accent-500/10 rounded transition-colors"
              @click="handleEdit(row)"
              title="编辑"
            >
              <Edit2 class="w-4 h-4" />
            </button>
            <button
              v-if="userStore.hasPermission('alarm:delete')"
              class="p-1.5 text-danger hover:text-danger/80 hover:bg-danger/10 rounded transition-colors"
              @click="handleDelete(row)"
              title="删除"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="showDialog"
      :title="dialogMode === 'create' ? '新增告警规则' : '编辑告警规则'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
        class="mt-4"
      >
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入规则名称" />
        </el-form-item>
        <el-form-item label="监控指标">
          <el-select v-model="formData.metric" class="w-full">
            <el-option
              v-for="opt in metricOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="比较方式">
          <el-select v-model="formData.operator" class="w-full">
            <el-option
              v-for="opt in operatorOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="阈值" prop="threshold">
          <el-input-number v-model="formData.threshold" :min="0" :max="100" class="w-full" />
        </el-form-item>
        <el-form-item label="持续时间">
          <el-input-number v-model="formData.duration" :min="1" :max="60" class="w-full" />
          <span class="text-xs text-dark-textSecondary">分钟</span>
        </el-form-item>
        <el-form-item label="告警级别">
          <el-select v-model="formData.level" class="w-full">
            <el-option
              v-for="opt in levelOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="通知方式">
          <el-checkbox-group v-model="formData.notifyTypes">
            <el-checkbox
              v-for="opt in notifyTypeOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="通知用户">
          <el-select v-model="formData.notifyUsers" multiple class="w-full" placeholder="请选择通知用户">
            <el-option label="admin@example.com" value="admin@example.com" />
            <el-option label="op1@example.com" value="op1@example.com" />
            <el-option label="op2@example.com" value="op2@example.com" />
            <el-option label="viewer1@example.com" value="viewer1@example.com" />
          </el-select>
        </el-form-item>
        <el-form-item label="是否启用">
          <el-switch v-model="formData.enabled" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="formData.description" type="textarea" :rows="2" placeholder="请输入规则描述" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts">
import { ElMessage, ElMessageBox, ElTable, ElTableColumn, ElDialog, ElForm, ElFormItem, ElInput, ElInputNumber, ElSelect, ElOption, ElCheckbox, ElCheckboxGroup, ElSwitch } from 'element-plus'

export default {
  components: {
    ElMessage,
    ElMessageBox,
    ElTable,
    ElTableColumn,
    ElDialog,
    ElForm,
    ElFormItem,
    ElInput,
    ElInputNumber,
    ElSelect,
    ElOption,
    ElCheckbox,
    ElCheckboxGroup,
    ElSwitch
  }
}
</script>
