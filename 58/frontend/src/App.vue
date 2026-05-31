<template>
  <div class="app-container">
    <el-container>
      <el-header class="header">
        <div class="header-content">
          <el-icon :size="32" color="#409eff"><Document /></el-icon>
          <h1>文书手写字迹识别与内容结构化系统</h1>
        </div>
      </el-header>
      
      <el-main class="main-content">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-card class="upload-card">
              <template #header>
                <div class="card-header">
                  <el-icon color="#409eff"><Upload /></el-icon>
                  <span>图片上传与识别</span>
                </div>
              </template>
              <ImageUpload @processing="handleProcessing" @result="handleResult" />
            </el-card>
          </el-col>
          
          <el-col :span="12">
            <el-card class="result-card">
              <template #header>
                <div class="card-header">
                  <el-icon color="#67c23a"><DocumentChecked /></el-icon>
                  <span>识别结果</span>
                </div>
              </template>
              <ResultDisplay 
                :result="currentResult" 
                :loading="processing" 
                @updated="handleResultUpdated"
              />
            </el-card>
          </el-col>
        </el-row>
        
        <el-card class="history-card" style="margin-top: 20px">
          <template #header>
            <div class="card-header">
              <el-icon color="#e6a23c"><Clock /></el-icon>
              <span>历史记录</span>
            </div>
          </template>
          <HistoryList @select="handleSelect" @refresh="loadHistory" />
        </el-card>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { ProcessResult, DocumentRecord } from './types'
import ImageUpload from './components/ImageUpload.vue'
import ResultDisplay from './components/ResultDisplay.vue'
import HistoryList from './components/HistoryList.vue'

const currentResult = ref<ProcessResult | null>(null)
const processing = ref(false)
const historyList = ref<DocumentRecord[]>([])

const handleProcessing = (status: boolean) => {
  processing.value = status
  if (status) {
    currentResult.value = null
  }
}

const handleResult = (result: ProcessResult) => {
  currentResult.value = result
  processing.value = false
  ElMessage.success('识别完成！')
  loadHistory()
}

const handleSelect = (record: DocumentRecord) => {
  currentResult.value = {
    _id: record._id,
    id: record._id,
    filename: record.filename,
    original_image: '',
    preprocessed_image: '',
    ocr_result: record.ocr_result,
    structured_data: record.structured_data,
    created_at: record.created_at,
    processing_time: record.processing_time
  }
}

const handleResultUpdated = (result: ProcessResult) => {
  currentResult.value = result
  ElMessage.success('识别结果已更新')
  loadHistory()
}

const loadHistory = async () => {
  try {
    const { documentApi } = await import('./api')
    const result = await documentApi.list({ page: 1, page_size: 10 })
    historyList.value = result.items
  } catch (error) {
    console.error('加载历史记录失败:', error)
  }
}

onMounted(() => {
  loadHistory()
})
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e7eb 100%);
}

.header {
  background: linear-gradient(90deg, #409eff 0%, #66b1ff 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 100%;
}

.header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.main-content {
  padding: 24px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.upload-card,
.result-card,
.history-card {
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

:deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #ebeef5;
}

:deep(.el-card__body) {
  padding: 20px;
}
</style>
