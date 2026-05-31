<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="900px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <div v-loading="loading" class="detail-container">
      <div v-if="detailData.id" class="detail-content">
        <el-steps :active="currentStep" finish-status="success" class="flow-steps" align-center>
          <el-step v-for="step in flowSteps" :key="step.key" :title="step.title" />
        </el-steps>

        <el-tabs v-model="activeTab" class="detail-tabs">
          <el-tab-pane label="基本信息" name="base">
            <el-card class="info-card" shadow="never">
              <template #header>
                <div class="card-header">
                  <el-icon><Document /></el-icon>
                  <span>申请信息</span>
                </div>
              </template>
              <el-descriptions :column="2" border>
                <el-descriptions-item label="申请单号">
                  <span class="highlight-text">{{ detailData.applyNo }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="申请时间">
                  {{ formatTime(detailData.applyTime) }}
                </el-descriptions-item>
                <el-descriptions-item label="危化品名称">
                  <el-tag
                    :type="getDangerLevelTagType(detailData.dangerLevel)"
                    effect="light"
                    class="danger-tag"
                  >
                    {{ detailData.chemicalName }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="规格">
                  {{ detailData.specification || '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="危险等级">
                  <el-tag :type="getDangerLevelTagType(detailData.dangerLevel)">
                    {{ getDangerLevelName(detailData.dangerLevel) }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="申请数量">
                  <span class="quantity-text">{{ detailData.quantity }}</span>
                  {{ detailData.unit }}
                </el-descriptions-item>
                <el-descriptions-item label="申请人">
                  {{ detailData.applicantName }}
                </el-descriptions-item>
                <el-descriptions-item label="部门">
                  {{ detailData.departmentName }}
                </el-descriptions-item>
                <el-descriptions-item label="当前状态">
                  <el-tag :type="getStatusTagType(detailData.status)">
                    {{ getStatusName(detailData.status) }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="当前步骤">
                  {{ detailData.currentStepName || '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="完成时间">
                  {{ formatTime(detailData.finishTime) }}
                </el-descriptions-item>
                <el-descriptions-item label="用途">
                  {{ detailData.purpose || '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="备注" :span="2">
                  {{ detailData.remark || '-' }}
                </el-descriptions-item>
              </el-descriptions>
            </el-card>
          </el-tab-pane>

          <el-tab-pane label="审批流程" name="approval">
            <el-card class="info-card" shadow="never">
              <template #header>
                <div class="card-header">
                  <el-icon><Timer /></el-icon>
                  <span>审批流程</span>
                </div>
              </template>
              <el-timeline>
                <el-timeline-item
                  v-for="(item, index) in approvalFlow"
                  :key="item.id"
                  :timestamp="formatTime(item.approvalTime)"
                  :type="getTimelineType(item.status)"
                  :icon="getTimelineIcon(item.status)"
                  :hollow="item.status === 'pending'"
                >
                  <div class="timeline-content">
                    <div class="timeline-header">
                      <span class="step-name">{{ item.stepName }}</span>
                      <el-tag :type="getApprovalTagType(item.status)" size="small">
                        {{ getApprovalStatusName(item.status) }}
                      </el-tag>
                    </div>
                    <div class="timeline-info">
                      <span v-if="item.approverName">审批人：{{ item.approverName }}</span>
                      <span v-else class="text-muted">待审批</span>
                    </div>
                    <div v-if="item.opinion" class="timeline-opinion">
                      审批意见：{{ item.opinion }}
                    </div>
                  </div>
                </el-timeline-item>
              </el-timeline>
              <el-empty v-if="approvalFlow.length === 0" description="暂无审批流程数据" />
            </el-card>
          </el-tab-pane>

          <el-tab-pane label="溯源日志" name="trace">
            <el-card class="info-card" shadow="never">
              <template #header>
                <div class="card-header">
                  <el-icon><Histogram /></el-icon>
                  <span>溯源日志</span>
                </div>
              </template>
              <el-table :data="traceLogs" border stripe>
                <el-table-column prop="operateTime" label="操作时间" width="180">
                  <template #default="{ row }">
                    {{ formatTime(row.operateTime) }}
                  </template>
                </el-table-column>
                <el-table-column prop="typeName" label="操作类型" width="120">
                  <template #default="{ row }">
                    <el-tag size="small" :type="getTraceTagType(row.type)">
                      {{ row.typeName }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="operatorName" label="操作人" width="100" />
                <el-table-column prop="ip" label="IP地址" width="140" />
                <el-table-column prop="detail" label="操作详情">
                  <template #default="{ row }">
                    <el-tooltip :content="row.detail" placement="top">
                      <span class="detail-text">{{ row.detail }}</span>
                    </el-tooltip>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty v-if="traceLogs.length === 0" description="暂无溯源日志" />
            </el-card>
          </el-tab-pane>

          <el-tab-pane label="溯源链条" name="chain">
            <el-card class="info-card" shadow="never">
              <TraceChain :chain-data="traceChain" />
            </el-card>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" @click="handleExport">导出详情</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Document,
  Timer,
  Histogram,
  Check,
  Close,
  Clock,
  Upload
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import TraceChain from './TraceChain.vue'
import {
  getLedgerDetail,
  getLedgerApprovalFlow,
  getLedgerTraceLogs,
  getLedgerTraceChain
} from '@/api/ledger'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  ledgerId: {
    type: [String, Number],
    default: null
  }
})

const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const loading = ref(false)
const activeTab = ref('base')
const detailData = ref({})
const approvalFlow = ref([])
const traceLogs = ref([])
const traceChain = ref([])

const flowSteps = [
  { key: 'submit', title: '提交申请' },
  { key: 'dept_approve', title: '部门审批' },
  { key: 'safety_approve', title: '安全审批' },
  { key: 'warehouse_distribute', title: '仓库发放' },
  { key: 'receive', title: '领用完成' }
]

const dialogTitle = computed(() => {
  return detailData.value.applyNo ? `台账详情 - ${detailData.value.applyNo}` : '台账详情'
})

const currentStep = computed(() => {
  const stepKey = detailData.value.currentStep
  const index = flowSteps.findIndex(s => s.key === stepKey)
  return index > -1 ? index + 1 : 0
})

const formatTime = (time) => {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
}

const getDangerLevelTagType = (level) => {
  const typeMap = {
    '剧毒': 'danger',
    '高毒': 'warning',
    '易燃': 'warning',
    '易爆': 'danger',
    '腐蚀': 'danger',
    '其他': 'info'
  }
  return typeMap[level] || 'info'
}

const getDangerLevelName = (level) => {
  return level || '-'
}

const getStatusName = (status) => {
  const nameMap = {
    draft: '草稿',
    pending: '待审批',
    processing: '审批中',
    approved: '已通过',
    rejected: '已驳回',
    completed: '已完成',
    cancelled: '已取消'
  }
  return nameMap[status] || status
}

const getStatusTagType = (status) => {
  const typeMap = {
    draft: 'info',
    pending: 'warning',
    processing: 'primary',
    approved: 'success',
    rejected: 'danger',
    completed: 'success',
    cancelled: 'info'
  }
  return typeMap[status] || 'info'
}

const getTimelineType = (status) => {
  const typeMap = {
    approved: 'success',
    rejected: 'danger',
    pending: 'primary',
    processing: 'primary'
  }
  return typeMap[status] || 'primary'
}

const getTimelineIcon = (status) => {
  const iconMap = {
    approved: Check,
    rejected: Close,
    pending: Clock
  }
  return iconMap[status] || Upload
}

const getApprovalStatusName = (status) => {
  const nameMap = {
    approved: '已通过',
    rejected: '已驳回',
    pending: '待审批',
    processing: '审批中'
  }
  return nameMap[status] || status
}

const getApprovalTagType = (status) => {
  const typeMap = {
    approved: 'success',
    rejected: 'danger',
    pending: 'warning',
    processing: 'primary'
  }
  return typeMap[status] || 'info'
}

const getTraceTagType = (type) => {
  const typeMap = {
    create: 'info',
    submit: 'primary',
    approve: 'success',
    reject: 'danger',
    distribute: 'warning',
    receive: 'success',
    cancel: 'info',
    update: 'primary'
  }
  return typeMap[type] || 'info'
}

const loadDetail = async () => {
  if (!props.ledgerId) return
  
  loading.value = true
  try {
    const [detail, flow, logs, chain] = await Promise.all([
      getLedgerDetail(props.ledgerId),
      getLedgerApprovalFlow(props.ledgerId),
      getLedgerTraceLogs(props.ledgerId),
      getLedgerTraceChain(props.ledgerId)
    ])
    detailData.value = detail || {}
    approvalFlow.value = flow || []
    traceLogs.value = logs || []
    traceChain.value = chain || []
  } catch (error) {
    console.error('加载详情失败:', error)
  } finally {
    loading.value = false
  }
}

const handleExport = () => {
  ElMessage.info('导出功能开发中')
}

const handleClosed = () => {
  detailData.value = {}
  approvalFlow.value = []
  traceLogs.value = []
  traceChain.value = []
  activeTab.value = 'base'
}

watch(() => props.ledgerId, (newVal) => {
  if (newVal && visible.value) {
    loadDetail()
  }
})

watch(() => props.modelValue, (newVal) => {
  if (newVal && props.ledgerId) {
    loadDetail()
  }
})
</script>

<style scoped>
.detail-container {
  min-height: 400px;
}

.flow-steps {
  margin-bottom: 24px;
}

.detail-tabs {
  margin-top: 20px;
}

.info-card {
  margin-top: 0;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.highlight-text {
  color: #409eff;
  font-weight: 600;
}

.quantity-text {
  color: #e6a23c;
  font-weight: 600;
  font-size: 16px;
}

.danger-tag {
  font-size: 14px;
}

.timeline-content {
  padding: 8px 0;
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.step-name {
  font-weight: 600;
  color: #303133;
}

.timeline-info {
  font-size: 13px;
  color: #606266;
  margin-bottom: 4px;
}

.timeline-opinion {
  font-size: 13px;
  color: #909399;
  padding: 8px 12px;
  background-color: #f5f7fa;
  border-radius: 4px;
  border-left: 3px solid #409eff;
}

.text-muted {
  color: #c0c4cc;
}

.detail-text {
  display: inline-block;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
</style>
