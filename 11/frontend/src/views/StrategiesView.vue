<template>
  <div class="strategies-view">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">联动策略配置</span>
          <div class="header-actions">
            <el-button type="primary" size="small" @click="showAddDialog = true">
              <el-icon><Plus /></el-icon>
              新增策略
            </el-button>
            <el-button type="primary" size="small" @click="fetchStrategies">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="strategies" style="width: 100%;" v-loading="loading">
        <el-table-column prop="strategy_id" label="策略ID" width="120" />
        <el-table-column prop="name" label="策略名称" min-width="150" />
        <el-table-column prop="description" label="描述" min-width="200" />
        <el-table-column label="触发条件" min-width="250">
          <template #default="{ row }">
            <el-tag size="small" type="info">
              {{ formatCondition(row.trigger_condition) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="执行动作" min-width="150">
          <template #default="{ row }">
            <span v-for="(action, idx) in row.actions" :key="idx">
              <el-tag size="small" style="margin-right: 4px;">
                {{ getActionName(action.type) }}
              </el-tag>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              @change="toggleStrategy(row.strategy_id, row.enabled)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="viewExecutions(row)">
              执行日志
            </el-button>
            <el-button type="danger" size="small" @click="deleteStrategy(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAddDialog" title="新增策略" width="700px">
      <el-form :model="strategyForm" label-width="100px">
        <el-form-item label="策略名称">
          <el-input v-model="strategyForm.name" placeholder="请输入策略名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="strategyForm.description" type="textarea" :rows="2" placeholder="请输入描述" />
        </el-form-item>
        <el-form-item label="触发指标">
          <el-select v-model="strategyForm.trigger_condition.metric" placeholder="选择指标" style="width: 100%;">
            <el-option label="信号强度" value="signal_strength" />
            <el-option label="CPU使用率" value="cpu_usage" />
            <el-option label="内存使用率" value="memory_usage" />
            <el-option label="设备状态" value="status" />
            <el-option label="温度" value="temperature" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="比较方式">
              <el-select v-model="strategyForm.trigger_condition.operator" placeholder="选择方式" style="width: 100%;">
                <el-option label="大于" value="gt" />
                <el-option label="小于" value="lt" />
                <el-option label="等于" value="eq" />
                <el-option label="大于等于" value="gte" />
                <el-option label="小于等于" value="lte" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="阈值">
              <el-input-number v-model="strategyForm.trigger_condition.threshold" style="width: 100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="持续时间(秒)">
              <el-input-number v-model="strategyForm.trigger_condition.duration" :min="0" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="执行动作">
          <el-checkbox-group v-model="selectedActions">
            <el-checkbox label="alert">创建告警</el-checkbox>
            <el-checkbox label="webhook">Webhook通知</el-checkbox>
            <el-checkbox label="log">记录日志</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item v-if="selectedActions.includes('alert')" label="告警级别">
          <el-radio-group v-model="alertForm.severity">
            <el-radio value="critical">严重</el-radio>
            <el-radio value="warning">警告</el-radio>
            <el-radio value="info">提示</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="selectedActions.includes('alert')" label="告警消息">
          <el-input v-model="alertForm.message" placeholder="请输入告警消息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="createStrategy">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showExecutionsDialog" title="执行日志" width="800px">
      <el-table :data="executions" style="width: 100%;">
        <el-table-column prop="execution_id" label="执行ID" width="140" />
        <el-table-column prop="strategy_id" label="策略ID" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="trigger_data" label="触发数据">
          <template #default="{ row }">
            <span v-if="row.trigger_data">
              {{ JSON.stringify(row.trigger_data) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="executed_at" label="执行时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.executed_at) }}
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { strategyApi } from '../api'

const strategies = ref([])
const loading = ref(false)
const showAddDialog = ref(false)
const showExecutionsDialog = ref(false)
const executions = ref([])
const selectedActions = ref(['alert'])

const strategyForm = reactive({
  name: '',
  description: '',
  trigger_condition: {
    metric: '',
    operator: 'gt',
    threshold: 0,
    duration: 60
  }
})

const alertForm = reactive({
  severity: 'warning',
  message: ''
})

const getActionName = (type) => {
  const names = {
    alert: '创建告警',
    webhook: 'Webhook',
    log: '记录日志'
  }
  return names[type] || type
}

const formatCondition = (condition) => {
  if (typeof condition === 'string') {
    try {
      condition = JSON.parse(condition)
    } catch (e) {
      return condition
    }
  }
  
  const metricNames = {
    signal_strength: '信号强度',
    cpu_usage: 'CPU使用率',
    memory_usage: '内存使用率',
    status: '设备状态',
    temperature: '温度'
  }
  
  const opNames = {
    gt: '>',
    lt: '<',
    eq: '=',
    gte: '>=',
    lte: '<='
  }
  
  return `${metricNames[condition.metric] || condition.metric} ${opNames[condition.operator]} ${condition.threshold}`
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

const fetchStrategies = async () => {
  loading.value = true
  try {
    const res = await strategyApi.getAll()
    if (res.success) {
      strategies.value = res.data
    }
  } catch (e) {
    ElMessage.error('获取策略列表失败')
  } finally {
    loading.value = false
  }
}

const toggleStrategy = async (strategyId, enabled) => {
  try {
    await strategyApi.toggle(strategyId, enabled)
    ElMessage.success(enabled ? '策略已启用' : '策略已禁用')
  } catch (e) {
    ElMessage.error('操作失败')
    fetchStrategies()
  }
}

const createStrategy = async () => {
  try {
    const actions = []
    
    if (selectedActions.value.includes('alert')) {
      actions.push({
        type: 'alert',
        severity: alertForm.severity,
        message: alertForm.message
      })
    }
    if (selectedActions.value.includes('log')) {
      actions.push({ type: 'log' })
    }
    if (selectedActions.value.includes('webhook')) {
      actions.push({ type: 'webhook', url: '' })
    }
    
    await strategyApi.create({
      name: strategyForm.name,
      description: strategyForm.description,
      trigger_condition: strategyForm.trigger_condition,
      actions
    })
    
    ElMessage.success('创建成功')
    showAddDialog.value = false
    resetForm()
    fetchStrategies()
  } catch (e) {
    ElMessage.error('创建失败')
  }
}

const resetForm = () => {
  strategyForm.name = ''
  strategyForm.description = ''
  strategyForm.trigger_condition = {
    metric: '',
    operator: 'gt',
    threshold: 0,
    duration: 60
  }
  selectedActions.value = ['alert']
  alertForm.severity = 'warning'
  alertForm.message = ''
}

const deleteStrategy = async (strategy) => {
  try {
    await ElMessageBox.confirm(`确认删除策略 ${strategy.name}?`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    await strategyApi.delete(strategy.strategy_id)
    ElMessage.success('删除成功')
    fetchStrategies()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const viewExecutions = async (strategy) => {
  try {
    const res = await strategyApi.getExecutions(strategy.strategy_id)
    if (res.success) {
      executions.value = res.data
      showExecutionsDialog.value = true
    }
  } catch (e) {
    ElMessage.error('获取执行日志失败')
  }
}

onMounted(() => {
  fetchStrategies()
})
</script>

<style scoped>
.strategies-view {
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 16px;
  font-weight: bold;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
