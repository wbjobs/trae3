<template>
  <div class="my-application-container">
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="申请单号">
          <el-input
            v-model="searchForm.applicationNo"
            placeholder="请输入申请单号"
            clearable
            style="width: 200px"
          />
        </el-form-item>
        <el-form-item label="危化品名称">
          <el-input
            v-model="searchForm.chemicalName"
            placeholder="请输入危化品名称"
            clearable
            style="width: 200px"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="searchForm.status"
            placeholder="全部状态"
            clearable
            style="width: 150px"
          >
            <el-option label="草稿" value="draft" />
            <el-option label="待审批" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已驳回" value="rejected" />
            <el-option label="发放中" value="distributing" />
            <el-option label="已完成" value="completed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
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
            查询
          </el-button>
          <el-button @click="handleReset">
            重置
          </el-button>
          <el-button type="success" @click="goToApply">
            新建申请
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table :data="tableData" v-loading="loading" border stripe style="width: 100%">
        <el-table-column prop="applicationNo" label="申请单号" min-width="140" />
        <el-table-column prop="chemicalName" label="危化品名称" min-width="140" />
        <el-table-column prop="quantity" label="申请数量" min-width="100">
          <template #default="{ row }">
            {{ row.quantity }} {{ row.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" min-width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="currentStep" label="当前步骤" min-width="120">
          <template #default="{ row }">
            {{ getStepText(row.currentStep) }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="申请时间" min-width="160" />
        <el-table-column label="操作" min-width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleViewDetail(row)">
              查看详情
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              type="danger"
              link
              @click="handleCancel(row)"
            >
              取消
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
      title="申请详情"
      width="700px"
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
          <el-descriptions-item label="危化品名称">
            {{ detailData.chemicalName }}
          </el-descriptions-item>
          <el-descriptions-item label="CAS号">
            {{ detailData.casNo }}
          </el-descriptions-item>
          <el-descriptions-item label="申请数量">
            {{ detailData.quantity }} {{ detailData.unit }}
          </el-descriptions-item>
          <el-descriptions-item label="规格">
            {{ detailData.specification }}
          </el-descriptions-item>
          <el-descriptions-item label="使用用途" :span="2">
            {{ detailData.usage }}
          </el-descriptions-item>
          <el-descriptions-item label="使用地点" :span="2">
            {{ detailData.location }}
          </el-descriptions-item>
          <el-descriptions-item label="紧急联系人">
            {{ detailData.emergencyContact }}
          </el-descriptions-item>
          <el-descriptions-item label="紧急联系电话">
            {{ detailData.emergencyPhone }}
          </el-descriptions-item>
          <el-descriptions-item label="申请时间">
            {{ detailData.createdAt }}
          </el-descriptions-item>
          <el-descriptions-item label="申请人">
            {{ detailData.applicantName }}
          </el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">审批记录</el-divider>
        <el-timeline class="approval-timeline">
          <el-timeline-item
            v-for="(item, index) in detailData.approvalRecords"
            :key="index"
            :timestamp="item.time"
            :type="getTimelineType(item.action)"
          >
            <h4>{{ item.title }}</h4>
            <p>操作人：{{ item.operatorName }}</p>
            <p v-if="item.remark">意见：{{ item.remark }}</p>
          </el-timeline-item>
        </el-timeline>

        <el-divider content-position="left">溯源日志</el-divider>
        <el-table :data="detailData.traceLogs" border size="small">
          <el-table-column prop="time" label="时间" width="160" />
          <el-table-column prop="action" label="操作" width="120" />
          <el-table-column prop="operator" label="操作人" width="120" />
          <el-table-column prop="remark" label="备注" />
        </el-table>
      </template>

      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getApplicationList, getApplicationDetail, cancelApplication } from '@/api/application'

const router = useRouter()
const tableData = ref([])
const detailVisible = ref(false)
const detailData = ref(null)
const loading = ref(false)

const searchForm = reactive({
  applicationNo: '',
  chemicalName: '',
  status: '',
  dateRange: []
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
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

const stepMap = {
  draft: '待提交',
  dept_approve: '部门审批',
  safety_approve: '安全审批',
  warehouse_approve: '仓库审批',
  distributing: '发放中',
  completed: '已完成',
  rejected: '已驳回',
  cancelled: '已取消'
}

const getStatusText = (status) => {
  return statusMap[status]?.text || status
}

const getStatusTagType = (status) => {
  return statusMap[status]?.type || 'info'
}

const getStepText = (step) => {
  return stepMap[step] || step
}

const getTimelineType = (action) => {
  const typeMap = {
    submit: 'primary',
    approve: 'success',
    reject: 'danger',
    distribute: 'warning',
    complete: 'success',
    cancel: 'info',
    create: 'primary'
  }
  return typeMap[action] || 'primary'
}

const fetchList = async () => {
  try {
    loading.value = true
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      applicationNo: searchForm.applicationNo,
      chemicalName: searchForm.chemicalName,
      status: searchForm.status
    }
    
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0]
      params.endDate = searchForm.dateRange[1]
    }
    
    const res = await getApplicationList(params)
    tableData.value = res.list || res
    pagination.total = res.total || tableData.value.length
  } catch (error) {
    console.error('获取申请列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.page = 1
  fetchList()
}

const handleReset = () => {
  searchForm.applicationNo = ''
  searchForm.chemicalName = ''
  searchForm.status = ''
  searchForm.dateRange = []
  pagination.page = 1
  fetchList()
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
    const res = await getApplicationDetail(row.id)
    detailData.value = res
    detailVisible.value = true
  } catch (error) {
    console.error('获取申请详情失败:', error)
  }
}

const handleCancel = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要取消申请 ${row.applicationNo} 吗？`,
      '取消确认',
      {
        confirmButtonText: '确定取消',
        cancelButtonText: '返回',
        type: 'warning'
      }
    )
    
    await cancelApplication(row.id)
    ElMessage.success('申请已取消')
    fetchList()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('取消申请失败:', error)
    }
  }
}

const goToApply = () => {
  router.push('/apply/form')
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.my-application-container {
  padding: 20px;
}

.search-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.search-form {
  margin-bottom: 0;
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
