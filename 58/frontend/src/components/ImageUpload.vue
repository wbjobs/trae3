<template>
  <div class="upload-container">
    <div class="image-preview" v-if="previewUrl">
      <img :src="previewUrl" alt="预览图片" class="preview-img" />
      <div class="preview-actions">
        <el-button type="danger" @click="clearImage" :disabled="loading">
          <el-icon><Delete /></el-icon>
          重新上传
        </el-button>
      </div>
    </div>
    
    <el-upload
      v-else
      class="upload-dragger"
      drag
      action="#"
      :auto-upload="false"
      :show-file-list="false"
      :before-upload="beforeUpload"
      @change="handleFileChange"
      accept="image/*"
    >
      <el-icon class="upload-icon"><UploadFilled /></el-icon>
      <div class="el-upload__text">
        将图片拖到此处，或 <em>点击上传</em>
      </div>
      <template #tip>
        <div class="el-upload__tip">
          支持 JPG、PNG、BMP 格式，单个文件不超过 10MB
        </div>
      </template>
    </el-upload>
    
    <div class="upload-actions" v-if="selectedFile">
      <el-button 
        type="primary" 
        @click="processImage" 
        :loading="loading"
        size="large"
        class="process-btn"
      >
        <el-icon v-if="!loading"><MagicStick /></el-icon>
        {{ loading ? '识别处理中...' : '开始识别' }}
      </el-button>
    </div>
    
    <div v-if="loading" class="progress-section">
      <el-progress :percentage="progress" :status="progressStatus" :stroke-width="8" />
      <p class="progress-text">{{ progressText }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { documentApi } from '@/api'
import type { ProcessResult } from '@/types'

const emit = defineEmits<{
  processing: [status: boolean]
  result: [result: ProcessResult]
}>()

const selectedFile = ref<File | null>(null)
const previewUrl = ref<string>('')
const loading = ref(false)
const progress = ref(0)
const progressText = ref('')

const progressStatus = computed(() => {
  if (progress.value >= 100) return 'success'
  if (loading.value) return undefined
  return 'exception'
})

const beforeUpload = (file: File) => {
  const isImage = file.type.startsWith('image/')
  const isLt10M = file.size / 1024 / 1024 < 10
  
  if (!isImage) {
    ElMessage.error('只能上传图片文件！')
    return false
  }
  if (!isLt10M) {
    ElMessage.error('图片大小不能超过 10MB！')
    return false
  }
  return true
}

const handleFileChange = (uploadFile: any) => {
  const file = uploadFile.raw
  if (!file) return
  
  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

const clearImage = () => {
  selectedFile.value = null
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
  progress.value = 0
}

const simulateProgress = () => {
  const stages = [
    { percent: 20, text: '图像预处理中...' },
    { percent: 40, text: '文字识别中...' },
    { percent: 60, text: '内容结构化中...' },
    { percent: 80, text: '数据存储中...' },
    { percent: 95, text: '正在生成结果...' }
  ]
  
  let currentStage = 0
  const interval = setInterval(() => {
    if (currentStage < stages.length && loading.value) {
      progress.value = stages[currentStage].percent
      progressText.value = stages[currentStage].text
      currentStage++
    } else {
      clearInterval(interval)
    }
  }, 800)
  
  return interval
}

const processImage = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择图片文件！')
    return
  }
  
  loading.value = true
  emit('processing', true)
  progress.value = 5
  progressText.value = '正在上传图片...'
  
  const progressInterval = simulateProgress()
  
  try {
    const result = await documentApi.uploadAndProcess(selectedFile.value)
    progress.value = 100
    progressText.value = '识别完成！'
    emit('result', result)
  } catch (error: any) {
    console.error('识别失败:', error)
    ElMessage.error(error.response?.data?.detail || '识别失败，请重试')
    emit('processing', false)
  } finally {
    clearInterval(progressInterval)
    loading.value = false
  }
}
</script>

<style scoped>
.upload-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.upload-dragger {
  width: 100%;
}

:deep(.el-upload-dragger) {
  padding: 40px 20px;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  transition: all 0.3s;
}

:deep(.el-upload-dragger:hover) {
  border-color: #409eff;
  background: #ecf5ff;
}

.upload-icon {
  font-size: 67px;
  color: #c0c4cc;
  margin-bottom: 16px;
}

.el-upload__text {
  font-size: 14px;
  color: #606266;
}

.el-upload__text em {
  color: #409eff;
  font-style: normal;
}

.el-upload__tip {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}

.image-preview {
  width: 100%;
  text-align: center;
}

.preview-img {
  max-width: 100%;
  max-height: 300px;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.preview-actions {
  margin-top: 16px;
}

.upload-actions {
  width: 100%;
}

.process-btn {
  width: 100%;
}

.progress-section {
  width: 100%;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.progress-text {
  margin: 8px 0 0;
  font-size: 13px;
  color: #606266;
  text-align: center;
}
</style>
