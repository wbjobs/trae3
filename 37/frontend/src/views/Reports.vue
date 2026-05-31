<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">报表中心</h2>
      <el-button type="primary" @click="showGenerateDialog = true">
        <el-icon><Plus /></el-icon>
        生成报表
      </el-button>
    </div>

    <div class="filter-bar">
      <div class="filter-item">
        <span class="filter-label">报表类型:</span>
        <el-select v-model="filters.report_type" placeholder="全部" clearable style="width: 150px">
          <el-option label="振动数据报表" value="vibration" />
          <el-option label="异常分析报表" value="anomaly" />
        </el-select>
      </div>
      <div class="filter-item">
        <el-button type="primary" @click="loadReports">查询</el-button>
      </div>
    </div>

    <div class="chart-container">
      <div class="chart-title">报表列表</div>
      <el-table :data="reports" stripe v-loading="loading">
        <el-table-column prop="report_name" label="报表名称" min-width="200" />
        <el-table-column prop="report_type" label="报表类型" width="150">
          <template #default="{ row }">
            <el-tag>{{ row.report_type === 'vibration' ? '振动数据' : '异常分析' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="device_code" label="设备" width="120" />
        <el-table-column prop="file_format" label="格式" width="80" />
        <el-table-column prop="file_size" label="大小" width="100">
          <template #default="{ row }">
            {{ formatFileSize(row.file_size) }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="downloadReport(row)">下载</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showGenerateDialog" title="生成报表" width="600px">
      <el-form :model="reportForm" label-width="100px">
        <el-form-item label="报表名称">
          <el-input v-model="reportForm.report_name" />
        </el-form-item>
        <el-form-item label="报表类型">
          <el-select v-model="reportForm.report_type" style="width: 100%">
            <el-option label="振动数据报表" value="vibration" />
            <el-option label="异常分析报表" value="anomaly" />
          </el-select>
        </el-form-item>
        <el-form-item label="设备">
          <el-select v-model="reportForm.device_code" style="width: 100%">
            <el-option
              v-for="device in devices"
              :key="device.device_code"
              :label="device.device_name"
              :value="device.device_code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="reportForm.timeRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm:ss"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenerateDialog = false">取消</el-button>
        <el-button type="primary" @click="generateReport" :loading="generating">生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { reportApi, deviceApi } from '@/api'
import dayjs from 'dayjs'

const reports = ref([])
const devices = ref([])
const loading = ref(false)
const generating = ref(false)
const showGenerateDialog = ref(false)

const filters = reactive({
  report_type: ''
})

const reportForm = reactive({
  report_name: '',
  report_type: 'vibration',
  device_code: '',
  timeRange: []
})

const formatTime = (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')

const formatFileSize = (bytes) => {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

const loadReports = async () => {
  loading.value = true
  try {
    const data = await reportApi.getReports(filters)
    reports.value = data || []
  } catch (error) {
    ElMessage.error('加载报表列表失败')
  } finally {
    loading.value = false
  }
}

const loadDevices = async () => {
  try {
    const data = await deviceApi.getDevices()
    devices.value = data || []
  } catch (error) {
    console.error('Failed to load devices:', error)
  }
}

const downloadReport = (row) => {
  reportApi.downloadReport(row.id)
  ElMessage.success('开始下载')
}

const generateReport = async () => {
  if (!reportForm.report_name || !reportForm.device_code || !reportForm.timeRange?.length) {
    ElMessage.warning('请填写完整信息')
    return
  }

  generating.value = true
  try {
    await reportApi.generateReport({
      report_name: reportForm.report_name,
      report_type: reportForm.report_type,
      device_code: reportForm.device_code,
      start_time: reportForm.timeRange[0],
      end_time: reportForm.timeRange[1]
    })
    ElMessage.success('报表生成成功')
    showGenerateDialog.value = false
    loadReports()
  } catch (error) {
    ElMessage.error('报表生成失败')
  } finally {
    generating.value = false
  }
}

onMounted(() => {
  loadReports()
  loadDevices()
})
</script>
