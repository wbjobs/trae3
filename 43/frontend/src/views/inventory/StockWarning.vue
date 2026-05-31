<template>
  <div class="stock-warning-container">
    <el-card class="stats-card">
      <el-row :gutter="16">
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-icon normal">
              <el-icon><Box /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totalChemicals }}</div>
              <div class="stat-label">危化品总数</div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-icon success">
              <el-icon><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.normalCount }}</div>
              <div class="stat-label">库存正常</div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-icon warning">
              <el-icon><Warning /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.warningCount }}</div>
              <div class="stat-label">库存预警</div>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-icon danger">
              <el-icon><CircleClose /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.dangerCount }}</div>
              <div class="stat-label">库存严重不足</div>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="预警等级">
          <el-select
            v-model="searchForm.warningLevel"
            placeholder="全部等级"
            clearable
            style="width: 150px"
          >
            <el-option label="正常" value="normal" />
            <el-option label="预警" value="warning" />
            <el-option label="严重不足" value="danger" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input
            v-model="searchForm.keyword"
            placeholder="请输入名称/CAS号/规格"
            clearable
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
          <el-button @click="handleReset">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table :data="tableData" v-loading="loading" border stripe style="width: 100%">
        <el-table-column prop="chemicalName" label="危化品名称" min-width="140" fixed />
        <el-table-column prop="casNo" label="CAS号" min-width="130" />
        <el-table-column prop="specification" label="规格" min-width="100" />
        <el-table-column prop="dangerLevel" label="危险等级" min-width="100">
          <template #default="{ row }">
            <el-tag :type="getDangerTagType(row.dangerLevel)" size="small">
              {{ row.dangerLevel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前库存" min-width="120">
          <template #default="{ row }">
            <span :class="getStockClass(row.warningLevel)">
              {{ row.currentStock }} {{ row.unit }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="预警阈值" min-width="120">
          <template #default="{ row }">
            <div class="threshold-info">
              <span class="warning-text">预警: {{ row.warningThreshold }}</span>
              <span class="danger-text">严重: {{ row.dangerThreshold }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="warningLevel" label="预警状态" min-width="120">
          <template #default="{ row }">
            <el-tag :type="getWarningTagType(row.warningLevel)" size="small">
              {{ getWarningText(row.warningLevel) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleViewUsage(row)">
              使用趋势
            </el-button>
            <el-button type="warning" link @click="handleSetThreshold(row)">
              设置阈值
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="thresholdVisible"
      title="设置预警阈值"
      width="450px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="thresholdFormRef"
        :model="thresholdForm"
        :rules="thresholdRules"
        label-width="100px"
      >
        <el-form-item label="危化品名称">
          <span>{{ currentChemical?.chemicalName }}</span>
        </el-form-item>
        <el-form-item label="当前库存">
          <span>{{ currentChemical?.currentStock }} {{ currentChemical?.unit }}</span>
        </el-form-item>
        <el-form-item label="预警阈值" prop="warningThreshold">
          <el-input-number
            v-model="thresholdForm.warningThreshold"
            :min="1"
            :precision="2"
            style="width: 100%"
          />
          <div class="form-tip">库存低于此值时触发预警</div>
        </el-form-item>
        <el-form-item label="严重阈值" prop="dangerThreshold">
          <el-input-number
            v-model="thresholdForm.dangerThreshold"
            :min="1"
            :precision="2"
            style="width: 100%"
          />
          <div class="form-tip">库存低于此值时触发严重预警</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="thresholdVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSetThreshold">确认设置</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="usageVisible"
      title="领用趋势"
      width="700px"
      :close-on-click-modal="false"
    >
      <div class="usage-header">
        <h3>{{ currentChemical?.chemicalName }} - 近6个月领用趋势</h3>
      </div>
      <div class="chart-container" v-loading="usageLoading">
        <v-chart class="chart" :option="chartOption" autoresize />
      </div>
      <div class="usage-stats">
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="总领用次数">
            {{ usageStats.totalCount }} 次
          </el-descriptions-item>
          <el-descriptions-item label="总领用数量">
            {{ usageStats.totalQuantity }} {{ currentChemical?.unit }}
          </el-descriptions-item>
          <el-descriptions-item label="月均领用">
            {{ usageStats.avgQuantity }} {{ currentChemical?.unit }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button @click="usageVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Box, CircleCheck, Warning, CircleClose } from '@element-plus/icons-vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import {
  getInventoryStats,
  getLowStockList,
  setWarningThreshold,
  getUsageStats
} from '@/api/inventory'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const tableData = ref([])
const loading = ref(false)
const usageLoading = ref(false)
const thresholdVisible = ref(false)
const usageVisible = ref(false)
const thresholdFormRef = ref(null)
const currentChemical = ref(null)

const searchForm = reactive({
  warningLevel: '',
  keyword: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const stats = reactive({
  totalChemicals: 0,
  totalStock: 0,
  normalCount: 0,
  warningCount: 0,
  dangerCount: 0
})

const thresholdForm = reactive({
  warningThreshold: 10,
  dangerThreshold: 5
})

const thresholdRules = {
  warningThreshold: [
    { required: true, message: '请输入预警阈值', trigger: 'blur' }
  ],
  dangerThreshold: [
    { required: true, message: '请输入严重阈值', trigger: 'blur' }
  ]
}

const usageStats = reactive({
  totalCount: 0,
  totalQuantity: 0,
  avgQuantity: 0
})

const chartOption = computed(() => ({
  tooltip: {
    trigger: 'axis'
  },
  legend: {
    data: ['领用数量']
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: usageData.value.map(d => d.month)
  },
  yAxis: {
    type: 'value',
    name: '数量'
  },
  series: [
    {
      name: '领用数量',
      type: 'line',
      smooth: true,
      data: usageData.value.map(d => d.quantity),
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
            { offset: 1, color: 'rgba(64, 158, 255, 0.05)' }
          ]
        }
      },
      lineStyle: {
        color: '#409eff',
        width: 2
      }
    }
  ]
}))

const usageData = ref([])

const getDangerTagType = (level) => {
  const typeMap = {
    '剧毒': 'danger',
    '高毒': 'danger',
    '中毒': 'warning',
    '低毒': 'warning',
    '微毒': 'success',
    '易燃': 'danger',
    '易爆': 'danger',
    '腐蚀性': 'warning',
    '氧化性': 'warning',
    '一般': 'info'
  }
  return typeMap[level] || 'info'
}

const getWarningTagType = (level) => {
  const typeMap = {
    normal: 'success',
    warning: 'warning',
    danger: 'danger'
  }
  return typeMap[level] || 'info'
}

const getWarningText = (level) => {
  const textMap = {
    normal: '正常',
    warning: '预警',
    danger: '严重不足'
  }
  return textMap[level] || level
}

const getStockClass = (level) => {
  return `stock-${level}`
}

const fetchStats = async () => {
  try {
    const res = await getInventoryStats()
    Object.assign(stats, res)
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

const fetchList = async () => {
  try {
    loading.value = true
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      warningLevel: searchForm.warningLevel,
      keyword: searchForm.keyword
    }
    const res = await getLowStockList(params)
    tableData.value = res.list || res
    pagination.total = res.count || tableData.value.length
    if (res.warningCount !== undefined) {
      stats.warningCount = res.warningCount
      stats.dangerCount = res.dangerCount
    }
  } catch (error) {
    console.error('获取库存列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.page = 1
  fetchList()
}

const handleReset = () => {
  searchForm.warningLevel = ''
  searchForm.keyword = ''
  pagination.page = 1
  fetchList()
  fetchStats()
}

const handleSizeChange = (size) => {
  pagination.pageSize = size
  pagination.page = 1
  fetchList()
}

const handleCurrentChange = (page) => {
  pagination.page = page
  fetchList()
}

const handleSetThreshold = (row) => {
  currentChemical.value = row
  thresholdForm.warningThreshold = row.warningThreshold || 10
  thresholdForm.dangerThreshold = row.dangerThreshold || 5
  thresholdVisible.value = true
}

const confirmSetThreshold = async () => {
  if (!thresholdFormRef.value || !currentChemical.value) return
  
  await thresholdFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        await setWarningThreshold(currentChemical.value.id, {
          warningThreshold: thresholdForm.warningThreshold,
          dangerThreshold: thresholdForm.dangerThreshold
        })
        ElMessage.success('阈值设置成功')
        thresholdVisible.value = false
        fetchList()
        fetchStats()
      } catch (error) {
        console.error('设置阈值失败:', error)
      }
    }
  })
}

const handleViewUsage = async (row) => {
  currentChemical.value = row
  usageVisible.value = true
  usageLoading.value = true
  
  try {
    const data = await getUsageStats(row.id, { months: 6 })
    usageData.value = data || []
    
    usageStats.totalCount = usageData.value.reduce((sum, d) => sum + d.count, 0)
    usageStats.totalQuantity = usageData.value.reduce((sum, d) => sum + d.quantity, 0)
    usageStats.avgQuantity = (usageStats.totalQuantity / 6).toFixed(2)
  } catch (error) {
    console.error('获取使用统计失败:', error)
  } finally {
    usageLoading.value = false
  }
}

onMounted(() => {
  fetchStats()
  fetchList()
})
</script>

<style scoped>
.stock-warning-container {
  padding: 20px;
}

.stats-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #fff;
}

.stat-icon.normal {
  background: linear-gradient(135deg, #409eff, #66b1ff);
}

.stat-icon.success {
  background: linear-gradient(135deg, #67c23a, #85ce61);
}

.stat-icon.warning {
  background: linear-gradient(135deg, #e6a23c, #ebb563);
}

.stat-icon.danger {
  background: linear-gradient(135deg, #f56c6c, #f78989);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.search-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.table-card {
  border-radius: 8px;
}

.stock-normal {
  color: #67c23a;
  font-weight: 500;
}

.stock-warning {
  color: #e6a23c;
  font-weight: 500;
}

.stock-danger {
  color: #f56c6c;
  font-weight: 600;
}

.threshold-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.warning-text {
  color: #e6a23c;
}

.danger-text {
  color: #f56c6c;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.usage-header {
  margin-bottom: 16px;
}

.usage-header h3 {
  margin: 0;
  color: #303133;
  font-size: 16px;
}

.chart-container {
  height: 300px;
  margin-bottom: 16px;
}

.chart {
  width: 100%;
  height: 100%;
}

.usage-stats {
  margin-top: 16px;
}
</style>
