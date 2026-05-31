<template>
  <div class="pending-approval-container">
    <el-card class="header-card">
      <div class="header-wrapper">
        <el-radio-group v-model="activeTab" @change="handleTabChange">
          <el-radio-button label="pending">待我审批</el-radio-button>
          <el-radio-button label="approved">已审批</el-radio-button>
        </el-radio-group>
      </div>
    </el-card>

    <el-card class="table-card">
      <el-table :data="tableData" v-loading="loading" border stripe style="width: 100%">
        <el-table-column prop="applicationNo" label="申请单号" min-width="140" />
        <el-table-column prop="applicantName" label="申请人" min-width="100" />
        <el-table-column prop="department" label="申请部门" min-width="120" />
        <el-table-column prop="chemicalName" label="危化品名称" min-width="140" />
        <el-table-column prop="quantity" label="申请数量" min-width="100">
          <template #default="{ row }">
            {{ row.quantity }} {{ row.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="申请时间" min-width="160" />
        <el-table-column prop="currentStep" label="当前步骤" min-width="120">
          <template #default="{ row }">
            {{ getStepText(row.currentStep) }}
          </template>
        </el-table-column>
        <el-table-column v-if="activeTab === 'approved'" prop="approvalResult" label="审批结果" min-width="100">
          <template #default="{ row }">
            <el-tag :type="row.approvalResult === 'approved' ? 'success' : 'danger'">
              {{ row.approvalResult === 'approved' ? '通过' : '驳回' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleViewDetail(row)">
              查看详情
            </el-button>
            <template v-if="activeTab === 'pending'">
              <el-button type="success" link @click="handleApprove(row)">
                审批通过
              </el-button>
              <el-button type="danger" link @click="handleReject(row)">
                审批驳回
              </el-button>
            </template>
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
      width="600px"
      :close-on-click-modal="false"
    >
      <template v-if="detailData">
        <el-descriptions :column="2" border class="detail-desc">
          <el-descriptions-item label="申请单号">
            {{ detailData.applicationNo }}
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
            {{ detailData.casNo }}
          </el-descriptions-item>
          <el-descriptions-item label="规格">
            {{ detailData.specification }}
          </el-descriptions-item>
          <el-descriptions-item label="申请数量">
            {{ detailData.quantity }} {{ detailData.unit }}
          </el-descriptions-item>
          <el-descriptions-item label="危险等级">
            <el-tag :type="getDangerTagType(detailData.dangerLevel)">
              {{ detailData.dangerLevel }}
            </el-tag>
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
      </template>

      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="approveVisible"
      title="审批通过"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="approveFormRef"
        :model="approveForm"
        :rules="approveRules"
        label-width="100px"
      >
        <el-form-item label="审批意见" prop="remark">
          <el-input
            v-model="approveForm.remark"
            type="textarea"
            :rows="4"
            placeholder="请输入审批意见（选填）"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button type="success" @click="confirmApprove">
          确认通过
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="rejectVisible"
      title="审批驳回"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="rejectFormRef"
        :model="rejectForm"
        :rules="rejectRules"
        label-width="100px"
      >
        <el-form-item label="驳回原因" prop="reason">
          <el-select
            v-model="rejectForm.reason"
            placeholder="请选择驳回原因"
            style="width: 100%"
          >
            <el-option label="申请材料不完整" value="incomplete" />
            <el-option label="申请理由不充分" value="insufficient" />
            <el-option label="库存不足" value="no_stock" />
            <el-option label="超出领用限额" value="over_limit" />
            <el-option label="安全风险评估不通过" value="safety_risk" />
            <el-option label="其他原因" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="意见说明" prop="remark">
          <el-input
            v-model="rejectForm.remark"
            type="textarea"
            :rows="4"
            placeholder="请输入详细意见说明"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" @click="confirmReject">
          确认驳回
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getPendingApprovalList,
  getApplicationList,
  getApplicationDetail,
  approveApplication,
  rejectApplication
} from '@/api/application'

const activeTab = ref('pending')
const tableData = ref([])
const detailVisible = ref(false)
const detailData = ref(null)
const approveVisible = ref(false)
const rejectVisible = ref(false)
const approveFormRef = ref(null)
const rejectFormRef = ref(null)
const currentApprovalId = ref(null)
const loading = ref(false)

const approveForm = reactive({
  remark: ''
})

const rejectForm = reactive({
  reason: '',
  remark: ''
})

const approveRules = {
  remark: [
    { max: 500, message: '审批意见不能超过500字', trigger: 'blur' }
  ]
}

const rejectRules = {
  reason: [
    { required: true, message: '请选择驳回原因', trigger: 'change' }
  ],
  remark: [
    { required: true, message: '请输入意见说明', trigger: 'blur' },
    { min: 5, message: '意见说明至少5个字符', trigger: 'blur' }
  ]
}

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const stepMap = {
  1: '部门负责人审批',
  2: '安全管理员审核',
  3: '仓库管理员发放'
}

const getStepText = (step) => {
  return stepMap[step] || step || '未知'
}

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
    distribute: 'warning',
    complete: 'success',
    cancel: 'info',
    create: 'primary'
  }
  return typeMap[action] || 'primary'
}

const fetchPendingList = async () => {
  try {
    loading.value = true
    const res = await getPendingApprovalList()
    tableData.value = res.list || res
    pagination.total = res.total || tableData.value.length
  } catch (error) {
    console.error('获取待审批列表失败:', error)
  } finally {
    loading.value = false
  }
}

const fetchApprovedList = async () => {
  try {
    loading.value = true
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      approved: true
    }
    const res = await getApplicationList(params)
    tableData.value = res.list || res
    pagination.total = res.total || tableData.value.length
  } catch (error) {
    console.error('获取已审批列表失败:', error)
  } finally {
    loading.value = false
  }
}

const fetchList = () => {
  if (activeTab.value === 'pending') {
    fetchPendingList()
  } else {
    fetchApprovedList()
  }
}

const handleTabChange = () => {
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

const handleApprove = (row) => {
  currentApprovalId.value = row.id
  approveForm.remark = ''
  approveVisible.value = true
}

const handleReject = (row) => {
  currentApprovalId.value = row.id
  rejectForm.reason = ''
  rejectForm.remark = ''
  rejectVisible.value = true
}

const confirmApprove = async () => {
  if (!approveFormRef.value) return
  
  await approveFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        await ElMessageBox.confirm(
          '确认审批通过该申请吗？',
          '审批确认',
          {
            confirmButtonText: '确认通过',
            cancelButtonText: '取消',
            type: 'success'
          }
        )
        
        await approveApplication(currentApprovalId.value, {
          remark: approveForm.remark
        })
        
        ElMessage.success('审批通过')
        approveVisible.value = false
        fetchList()
      } catch (error) {
        if (error !== 'cancel') {
          console.error('审批失败:', error)
        }
      }
    }
  })
}

const confirmReject = async () => {
  if (!rejectFormRef.value) return
  
  await rejectFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        await ElMessageBox.confirm(
          '确认驳回该申请吗？驳回后申请将结束流程。',
          '驳回确认',
          {
            confirmButtonText: '确认驳回',
            cancelButtonText: '取消',
            type: 'danger'
          }
        )
        
        await rejectApplication(currentApprovalId.value, {
          reason: rejectForm.reason,
          remark: rejectForm.remark
        })
        
        ElMessage.success('已驳回申请')
        rejectVisible.value = false
        fetchList()
      } catch (error) {
        if (error !== 'cancel') {
          console.error('驳回失败:', error)
        }
      }
    }
  })
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.pending-approval-container {
  padding: 20px;
}

.header-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.header-wrapper {
  display: flex;
  justify-content: flex-start;
  align-items: center;
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
