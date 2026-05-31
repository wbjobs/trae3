<template>
  <div class="ledger-container">
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="申请单号">
          <el-input
            v-model="searchForm.keyword"
            placeholder="请输入申请单号/危化品/申请人"
            clearable
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="searchForm.status"
            placeholder="全部状态"
            clearable
            style="width: 150px"
          >
            <el-option label="待审批" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已驳回" value="rejected" />
            <el-option label="发放中" value="distributing" />
            <el-option label="已完成" value="completed" />
          </el-select>
        </el-form-item>
        <el-form-item label="危险等级">
          <el-select
            v-model="searchForm.dangerLevel"
            placeholder="全部等级"
            clearable
            style="width: 150px"
          >
            <el-option label="剧毒" value="剧毒" />
            <el-option label="高毒" value="高毒" />
            <el-option label="易燃" value="易燃" />
            <el-option label="易爆" value="易爆" />
            <el-option label="腐蚀" value="腐蚀" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="申请部门">
          <el-input
            v-model="searchForm.department"
            placeholder="请输入部门"
            clearable
            style="width: 150px"
          />
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 280px"
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
          <el-button type="success" @click="handleExport" :loading="exporting">
            <el-icon><Download /></el-icon>
            导出Excel
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-label">申请总数</div>
            <div class="stat-value text-primary">{{ stats.totalApplications }}</div>
          </div>
          <el-icon class="stat-icon primary"><Document /></el-icon>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-label">领用总量</div>
            <div class="stat-value text-success">{{ stats.totalQuantity }}</div>
          </div>
          <el-icon class="stat-icon success"><Box /></el-icon>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-label">待审批</div>
            <div class="stat-value text-warning">{{ stats.pendingCount }}</div>
          </div>
          <el-icon class="stat-icon warning"><Clock /></el-icon>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-label">已完成</div>
            <div class="stat-value text-success">{{ stats.completedCount }}</div>
          </div>
          <el-icon class="stat-icon success"><CircleCheck /></el-icon>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="table-card">
      <el-table :data="tableData" v-loading="loading" border stripe style="width: 100%">
        <el-table-column prop="applicationNo" label="申请单号" min-width="140" fixed />
        <el-table-column prop="applicantName" label="申请人" min-width="100" />
        <el-table-column prop="department" label="申请部门" min-width="120" />
        <el-table-column prop="chemicalName" label="危化品名称" min-width="140" />
        <el-table-column prop="casNo" label="CAS号" min-width="130">
          <template #default="{ row }">
            {{ row.chemical?.casNo }}
          </template>
        </el-table-column>
        <el-table-column prop="dangerLevel" label="危险等级" min-width="100">
          <template #default="{ row }">
            <el-tag :type="getDangerTagType(row.chemical?.dangerLevel)" size="small">
              {{ row.chemical?.dangerLevel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" min-width="100">
          <template #default="{ row }">
            {{ row.quantity }} {{ row.chemical?.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="purpose" label="使用用途" min-width="150" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" min-width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="submitTime" label="提交时间" min-width="160" />
        <el-table-column label="操作" min-width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleViewDetail(row)">
              详情
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
      v-model="detailVisible"
      title="台账详情"
      width="750px"
      :close-on-click-modal="false"
    >
      <template v-if="detailData">
        <el-descriptions :column="2" border class="detail-desc">
          <el-descriptions-item label="申请单号">
            {{ detailData.applicationNo }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusTagType(detailData.status)">
              {{ getStatusText(detailData.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="申请人">
            {{ detailData.applicantName }}
          </el-descriptions-item>
          <el-descriptions-item label="申请部门">
            {{ detailData.department }}
          </el-descriptions-item>
          <el-descriptions-item label="危化品名称">
            {{ detailData.chemicalName }}
          </el-descriptions-item>
          <el-descriptions-item label="CAS号">
            {{ detailData.chemical?.casNo }}
          </el-descriptions-item>
          <el-descriptions-item label="规格">
            {{ detailData.chemical?.specification }}
          </el-descriptions-item>
          <el-descriptions-item label="危险等级">
            <el-tag :type="getDangerTagType(detailData.chemical?.dangerLevel)">
              {{ detailData.chemical?.dangerLevel }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="申请数量">
            {{ detailData.quantity }} {{ detailData.chemical?.unit }}
          </el-descriptions-item>
          <el-descriptions-item label="提交时间">
            {{ detailData.submitTime }}
          </el-descriptions-item>
          <el-descriptions-item label="使用用途" :span="2">
            {{ detailData.purpose }}
          </el-descriptions-item>
          <el-descriptions-item label="使用地点" :span="2">
            {{ detailData.usageLocation }}
          </el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">审批记录</el-divider>
        <el-timeline class="approval-timeline">
          <el-timeline-item
            v-for="(item, index) in detailData.approvalRecords"
            :key="index"
            :timestamp="item.createdAt"
            :type="getTimelineType(item.action)"
          >
            <h4>{{ item.action === 'approve' ? '审批通过' : item.action === 'reject' ? '审批驳回' : '提交' }}</h4>
            <p>操作人：{{ item.approverName }}</p>
            <p v-if="item.opinion">意见：{{ item.opinion }}</p>
          </el-timeline-item>
        </el-timeline>
      </template>

      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Download, Document, Box, Clock, CircleCheck } from '@element-plus/icons-vue'
import {
  getLedgerList,
  getLedgerDetail,
  exportLedger,
  getLedgerStats
} from '@/api/ledger'

const tableData = ref([])
const detailVisible = ref(false)
const detailData = ref(null)
const loading = ref(false)
const exporting = ref(false)

const searchForm = reactive({
  keyword: '',
  status: '',
  dangerLevel: '',
  department: '',
  dateRange: []
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const stats = reactive({
  totalApplications: 0,
  totalQuantity: 0,
  pendingCount: 0,
  completedCount: 0
})

const statusMap = {
  draft: { text: '草稿', type: 'info' },
  pending: { text: '待审批', type: 'warning' },
  approved: { text: '已通过', type: 'success' },
  rejected: { text: '已驳回', type: 'danger' },
  distributing: { text: '发放中', type: 'primary' },
  completed: { text: '已完成', type: 'success' },
  cancelled: { text: '已取消', type: 'info' }
}

const getStatusText = (status) => statusMap[status]?.text || status
const getStatusTagType = (status) => statusMap[status]?.type || 'info'

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

const getTimelineType = (action) => {
  const typeMap = {
    submit: 'primary',
    approve: 'success',
    reject: 'danger',
    distribute: 'warning'
  }
  return typeMap[action] || 'primary'
}

const fetchStats = async () => {
  try {
    const res = await getLedgerStats()
    const statusStats = res.statusStats || []
    stats.totalApplications = res.totalApplications || 0
    stats.totalQuantity = res.totalQuantity || 0
    stats.pendingCount = statusStats.find(s => s.status === 'pending')?.count || 0
    stats.completedCount = statusStats.find(s => s.status === 'completed')?.count || 0
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
      keyword: searchForm.keyword,
      status: searchForm.status,
      dangerLevel: searchForm.dangerLevel,
      department: searchForm.department
    }
    
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0]
      params.endDate = searchForm.dateRange[1]
    }
    
    const res = await getLedgerList(params)
    tableData.value = res.list || res
    pagination.total = res.total || tableData.value.length
  } catch (error) {
    console.error('获取台账列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.page = 1
  fetchList()
  fetchStats()
}

const handleReset = () => {
  searchForm.keyword = ''
  searchForm.status = ''
  searchForm.dangerLevel = ''
  searchForm.department = ''
  searchForm.dateRange = []
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

const handleViewDetail = async (row) => {
  try {
    const res = await getLedgerDetail(row.id)
    detailData.value = res
    detailVisible.value = true
  } catch (error) {
    console.error('获取详情失败:', error)
  }
}

const handleExport = async () => {
  try {
    await ElMessageBox.confirm(
      '确认导出当前筛选条件下的台账数据吗？',
      '导出确认',
      {
        confirmButtonText: '确认导出',
        cancelButtonText: '取消',
        type: 'info'
      }
    )
    
    exporting.value = true
    const params = {
      keyword: searchForm.keyword,
      status: searchForm.status,
      dangerLevel: searchForm.dangerLevel,
      department: searchForm.department
    }
    
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0]
      params.endDate = searchForm.dateRange[1]
    }
    
    const blob = await exportLedger(params)
    const url = window.URL.createObjectURL(new Blob([blob]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `危化品台账_${new Date().toISOString().slice(0, 10)}.xlsx`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    
    ElMessage.success('导出成功')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('导出失败:', error)
      ElMessage.error('导出失败')
    }
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  fetchList()
  fetchStats()
})
</script>

<style scoped>
.ledger-container {
  padding: 20px;
}

.search-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.search-form {
  margin-bottom: 0;
}

.stats-row {
  margin-bottom: 16px;
}

.stat-card {
  border-radius: 8px;
  overflow: hidden;
}

.stat-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
}

.text-primary {
  color: #409eff;
}

.text-success {
  color: #67c23a;
}

.text-warning {
  color: #e6a23c;
}

.stat-icon {
  font-size: 48px;
  opacity: 0.3;
}

.stat-icon.primary {
  color: #409eff;
}

.stat-icon.success {
  color: #67c23a;
}

.stat-icon.warning {
  color: #e6a23c;
}

.table-card {
  border-radius: 8px;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.detail-desc {
  margin-bottom: 20px;
}

.approval-timeline {
  padding-left: 20px;
}
</style>
