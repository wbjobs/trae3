<template>
  <div class="history-container">
    <div class="search-bar">
      <el-input 
        v-model="searchKeyword" 
        placeholder="搜索关键词..." 
        style="width: 240px"
        clearable
        @keyup.enter="search"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
      />
      
      <el-button type="primary" @click="search">
        <el-icon><Search /></el-icon>
        搜索
      </el-button>
      
      <el-button @click="resetSearch">
        <el-icon><Refresh /></el-icon>
        重置
      </el-button>
    </div>
    
    <div class="batch-actions" v-if="selectedIds.length > 0">
      <el-tag type="info">已选择 {{ selectedIds.length }} 项</el-tag>
      <el-button size="small" type="success" @click="showExportDialog">
        <el-icon><Download /></el-icon>
        导出选中
      </el-button>
      <el-button size="small" type="danger" @click="handleBatchDelete">
        <el-icon><Delete /></el-icon>
        批量删除
      </el-button>
      <el-button size="small" @click="clearSelection">
        取消选择
      </el-button>
    </div>
    
    <div class="table-section">
      <el-table 
        :data="tableData" 
        v-loading="loading"
        style="width: 100%"
        @row-click="handleRowClick"
        highlight-current-row
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        
        <el-table-column prop="filename" label="文件名" min-width="180">
          <template #default="{ row }">
            <div class="filename-cell">
              <el-icon color="#409eff"><Document /></el-icon>
              <span>{{ row.filename }}</span>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column label="识别摘要" min-width="250">
          <template #default="{ row }">
            <span class="text-preview">
              {{ getTextPreview(row.ocr_result.raw_text) }}
            </span>
          </template>
        </el-table-column>
        
        <el-table-column label="置信度" width="120">
          <template #default="{ row }">
            <el-tag :type="getConfidenceType(row.ocr_result.confidence)">
              {{ (row.ocr_result.confidence * 100).toFixed(1) }}%
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column label="处理耗时" width="100">
          <template #default="{ row }">
            {{ row.processing_time.toFixed(2) }}s
          </template>
        </el-table-column>
        
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click.stop="handleView(row)">
              <el-icon><View /></el-icon>
              查看
            </el-button>
            <el-button type="success" link @click.stop="handleSingleExport(row)">
              <el-icon><Download /></el-icon>
              导出
            </el-button>
            <el-button type="danger" link @click.stop="handleDelete(row)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    
    <div class="pagination-section">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>
    
    <el-dialog v-model="exportDialogVisible" title="批量导出报表" width="480px">
      <el-form label-width="100px">
        <el-form-item label="导出范围">
          <el-radio-group v-model="exportForm.scope">
            <el-radio value="selected" v-if="selectedIds.length > 0">已选中 ({{ selectedIds.length }} 项)</el-radio>
            <el-radio value="filtered">当前筛选结果</el-radio>
            <el-radio value="all">全部文档</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item label="导出格式">
          <el-radio-group v-model="exportForm.format">
            <el-radio value="json">JSON</el-radio>
            <el-radio value="csv">CSV</el-radio>
            <el-radio value="excel">Excel</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item label="详细数据">
          <el-switch v-model="exportForm.include_images" />
          <span style="margin-left: 8px; color: #909399; font-size: 13px">包含 OCR 行级详细数据</span>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="exportDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="executeExport" :loading="exporting">
          <el-icon><Download /></el-icon>
          开始导出
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { documentApi } from '@/api'
import type { DocumentRecord, SearchParams, BatchExportRequest } from '@/types'

const emit = defineEmits<{
  select: [record: DocumentRecord]
  refresh: []
}>()

const tableData = ref<DocumentRecord[]>([])
const loading = ref(false)
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)
const searchKeyword = ref('')
const dateRange = ref<string[]>([])

const selectedIds = ref<string[]>([])
const exportDialogVisible = ref(false)
const exporting = ref(false)
const exportForm = ref({
  scope: 'selected' as 'selected' | 'filtered' | 'all',
  format: 'json' as 'json' | 'csv' | 'excel',
  include_images: false
})

const getConfidenceType = (conf: number) => {
  if (conf >= 0.8) return 'success'
  if (conf >= 0.6) return 'warning'
  return 'danger'
}

const getTextPreview = (text: string) => {
  if (!text) return '-'
  return text.length > 50 ? text.substring(0, 50) + '...' : text
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const fetchData = async () => {
  loading.value = true
  try {
    const params: SearchParams = {
      page: currentPage.value,
      page_size: pageSize.value
    }
    
    if (searchKeyword.value) {
      params.keyword = searchKeyword.value
    }
    
    if (dateRange.value.length === 2) {
      params.start_date = dateRange.value[0]
      params.end_date = dateRange.value[1]
    }
    
    const result = await documentApi.list(params)
    tableData.value = result.items
    total.value = result.total
  } catch (error) {
    console.error('获取历史记录失败:', error)
    ElMessage.error('获取历史记录失败')
  } finally {
    loading.value = false
  }
}

const search = () => {
  currentPage.value = 1
  clearSelection()
  fetchData()
}

const resetSearch = () => {
  searchKeyword.value = ''
  dateRange.value = []
  currentPage.value = 1
  clearSelection()
  fetchData()
}

const handleSizeChange = () => {
  currentPage.value = 1
  clearSelection()
  fetchData()
}

const handleCurrentChange = () => {
  clearSelection()
  fetchData()
}

const handleRowClick = (row: DocumentRecord) => {
  emit('select', row)
}

const handleView = (row: DocumentRecord) => {
  emit('select', row)
}

const handleSelectionChange = (selection: DocumentRecord[]) => {
  selectedIds.value = selection.map(r => r._id)
}

const clearSelection = () => {
  selectedIds.value = []
}

const handleDelete = async (row: DocumentRecord) => {
  try {
    await ElMessageBox.confirm(
      '确定要删除这条记录吗？此操作不可恢复。',
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    await documentApi.delete(row._id)
    ElMessage.success('删除成功')
    fetchData()
    emit('refresh')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

const handleBatchDelete = async () => {
  if (selectedIds.value.length === 0) return
  
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedIds.value.length} 条记录吗？此操作不可恢复。`,
      '批量删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const result = await documentApi.batchDelete(selectedIds.value)
    ElMessage.success(`成功删除 ${result.success_count} 条记录`)
    clearSelection()
    fetchData()
    emit('refresh')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量删除失败:', error)
      ElMessage.error('批量删除失败')
    }
  }
}

const showExportDialog = () => {
  exportForm.value.scope = selectedIds.value.length > 0 ? 'selected' : 'filtered'
  exportDialogVisible.value = true
}

const handleSingleExport = (row: DocumentRecord) => {
  selectedIds.value = [row._id]
  exportForm.value.scope = 'selected'
  exportDialogVisible.value = true
}

const executeExport = async () => {
  exporting.value = true
  try {
    const requestData: BatchExportRequest = {
      format: exportForm.value.format,
      include_images: exportForm.value.include_images
    }
    
    if (exportForm.value.scope === 'selected') {
      requestData.ids = [...selectedIds.value]
    } else if (exportForm.value.scope === 'filtered') {
      if (searchKeyword.value) {
        requestData.keyword = searchKeyword.value
      }
      if (dateRange.value.length === 2) {
        requestData.start_date = dateRange.value[0]
        requestData.end_date = dateRange.value[1]
      }
    }
    
    const blob = await documentApi.exportDocuments(requestData)
    
    const formatExt = exportForm.value.format === 'excel' ? 'xlsx' : exportForm.value.format
    const contentType = exportForm.value.format === 'json' 
      ? 'application/json'
      : exportForm.value.format === 'csv'
        ? 'text/csv;charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    
    const downloadBlob = new Blob([blob], { type: contentType })
    const url = URL.createObjectURL(downloadBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ocr_records_${Date.now()}.${formatExt}`
    link.click()
    URL.revokeObjectURL(url)
    
    ElMessage.success('导出成功')
    exportDialogVisible.value = false
  } catch (error: any) {
    console.error('导出失败:', error)
    
    if (error?.response?.status === 400) {
      try {
        const reader = new FileReader()
        reader.onload = () => {
          const errorText = reader.result as string
          try {
            const errorData = JSON.parse(errorText)
            ElMessage.error(errorData.detail || '导出失败')
          } catch {
            ElMessage.error(errorText || '导出失败')
          }
        }
        reader.readAsText(error.response.data)
      } catch {
        ElMessage.error('导出失败，请检查所需依赖是否安装')
      }
    } else {
      ElMessage.error('导出失败，请重试')
    }
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  fetchData()
})

defineExpose({
  refresh: fetchData
})
</script>

<style scoped>
.history-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.batch-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  background: #f0f9eb;
  border: 1px solid #e1f3d8;
  border-radius: 6px;
}

.table-section {
  min-height: 200px;
}

.pagination-section {
  display: flex;
  justify-content: flex-end;
}

.filename-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-preview {
  color: #606266;
}

:deep(.el-table__row) {
  cursor: pointer;
}

:deep(.el-table__row:hover) {
  background: #ecf5ff;
}
</style>
