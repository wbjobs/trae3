<template>
  <div class="result-container">
    <div v-if="loading" class="loading-state">
      <el-icon class="loading-icon" :size="48"><Loading /></el-icon>
      <p>正在处理中，请稍候...</p>
    </div>
    
    <div v-else-if="!result" class="empty-state">
      <el-empty description="请上传图片进行识别">
        <template #image>
          <el-icon :size="80" color="#c0c4cc"><Document /></el-icon>
        </template>
      </el-empty>
    </div>
    
    <div v-else class="result-content">
      <div class="result-header">
        <div class="result-info">
          <el-tag type="primary" size="small">{{ result.filename }}</el-tag>
          <span class="confidence">
            置信度: 
            <el-tag :type="confidenceType" size="small">
              {{ (result.ocr_result.confidence * 100).toFixed(1) }}%
            </el-tag>
          </span>
          <span class="time">
            耗时: {{ result.processing_time.toFixed(2) }}s
          </span>
          <el-tag v-if="isEditing" type="warning" size="small">编辑模式</el-tag>
        </div>
        <div class="header-actions">
          <el-button 
            v-if="!isEditing && result._id" 
            size="small" 
            @click="startEditing"
          >
            <el-icon><Edit /></el-icon>
            修正结果
          </el-button>
          <template v-else-if="isEditing">
            <el-button size="small" type="success" @click="saveCorrection" :loading="saving">
              <el-icon><Check /></el-icon>
              保存
            </el-button>
            <el-button size="small" @click="cancelEditing">
              <el-icon><Close /></el-icon>
              取消
            </el-button>
          </template>
        </div>
      </div>
      
      <el-tabs v-model="activeTab" class="result-tabs">
        <el-tab-pane label="原始文本" name="raw">
          <div class="raw-text">
            <el-input
              v-if="isEditing"
              v-model="editForm.ocr_result.raw_text"
              type="textarea"
              :rows="12"
              placeholder="输入识别文本..."
            />
            <pre v-else>{{ result.ocr_result.raw_text }}</pre>
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="识别详情" name="lines">
          <div class="lines-list">
            <div 
              v-for="(line, index) in displayLines" 
              :key="index" 
              class="line-item"
            >
              <div class="line-header">
                <span class="line-index">行 {{ index + 1 }}</span>
                <el-tag 
                  :type="getConfidenceType(line.confidence)" 
                  size="small"
                >
                  {{ (line.confidence * 100).toFixed(1) }}%
                </el-tag>
              </div>
              <div v-if="!isEditing" class="line-text">{{ line.text }}</div>
              <el-input
                v-else
                v-model="editForm.ocr_result.lines[index].text"
                size="small"
                placeholder="输入修正后的文本..."
              />
            </div>
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="结构化结果" name="structured">
          <div class="structured-result">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="标题">
                <el-input
                  v-if="isEditing"
                  v-model="editForm.structured_data.title"
                  size="small"
                  placeholder="输入标题..."
                />
                <span v-else-if="result.structured_data.title">
                  {{ result.structured_data.title }}
                </span>
                <span v-else class="empty-field">未识别</span>
              </el-descriptions-item>
              
              <el-descriptions-item label="日期">
                <el-input
                  v-if="isEditing"
                  v-model="editForm.structured_data.date"
                  size="small"
                  placeholder="输入日期..."
                />
                <span v-else-if="result.structured_data.date">
                  {{ result.structured_data.date }}
                </span>
                <span v-else class="empty-field">未识别</span>
              </el-descriptions-item>
              
              <el-descriptions-item label="发件人">
                <el-input
                  v-if="isEditing"
                  v-model="editForm.structured_data.sender"
                  size="small"
                  placeholder="输入发件人..."
                />
                <span v-else-if="result.structured_data.sender">
                  {{ result.structured_data.sender }}
                </span>
                <span v-else class="empty-field">未识别</span>
              </el-descriptions-item>
              
              <el-descriptions-item label="收件人">
                <el-input
                  v-if="isEditing"
                  v-model="editForm.structured_data.receiver"
                  size="small"
                  placeholder="输入收件人..."
                />
                <span v-else-if="result.structured_data.receiver">
                  {{ result.structured_data.receiver }}
                </span>
                <span v-else class="empty-field">未识别</span>
              </el-descriptions-item>
              
              <el-descriptions-item label="签名">
                <el-input
                  v-if="isEditing"
                  v-model="editForm.structured_data.signature"
                  size="small"
                  placeholder="输入签名..."
                />
                <span v-else-if="result.structured_data.signature">
                  {{ result.structured_data.signature }}
                </span>
                <span v-else class="empty-field">未识别</span>
              </el-descriptions-item>
              
              <el-descriptions-item label="正文摘要">
                <el-input
                  v-if="isEditing"
                  v-model="editForm.structured_data.content"
                  type="textarea"
                  :rows="3"
                  placeholder="输入正文摘要..."
                />
                <span v-else-if="result.structured_data.content">
                  {{ result.structured_data.content }}
                </span>
                <span v-else class="empty-field">未识别</span>
              </el-descriptions-item>
              
              <el-descriptions-item label="关键词">
                <div v-if="isEditing" class="keywords-edit">
                  <el-input
                    v-model="keywordsInput"
                    size="small"
                    placeholder="用逗号分隔多个关键词"
                    @blur="updateKeywords"
                  />
                </div>
                <div v-else-if="result.structured_data.keywords.length > 0" class="keywords">
                  <el-tag 
                    v-for="(kw, idx) in result.structured_data.keywords" 
                    :key="idx"
                    size="small"
                    style="margin-right: 8px; margin-bottom: 4px"
                  >
                    {{ kw }}
                  </el-tag>
                </div>
                <span v-else class="empty-field">未识别</span>
              </el-descriptions-item>
              
              <el-descriptions-item 
                v-for="(field, idx) in displayCustomFields" 
                :key="field.name"
                :label="field.name"
              >
                <el-input
                  v-if="isEditing"
                  v-model="editForm.structured_data.custom_fields[idx].value"
                  size="small"
                  placeholder="输入字段值..."
                />
                <span v-else>
                  {{ field.value }}
                  <el-tag 
                    :type="getConfidenceType(field.confidence)" 
                    size="small"
                    style="margin-left: 8px"
                  >
                    {{ (field.confidence * 100).toFixed(1) }}%
                  </el-tag>
                </span>
              </el-descriptions-item>
            </el-descriptions>
            
            <div v-if="isEditing" class="correction-note">
              <el-input
                v-model="editForm.correction_note"
                type="textarea"
                :rows="2"
                placeholder="输入修正备注（可选）..."
              />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
      
      <div class="result-actions">
        <el-button @click="copyText" type="primary">
          <el-icon><CopyDocument /></el-icon>
          复制文本
        </el-button>
        <el-button @click="exportJson">
          <el-icon><Download /></el-icon>
          导出 JSON
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { documentApi } from '@/api'
import type { ProcessResult, OCRLine, StructuredField, CorrectionRequest } from '@/types'

const props = defineProps<{
  result: ProcessResult | null
  loading: boolean
}>()

const emit = defineEmits<{
  updated: [record: ProcessResult]
}>()

const activeTab = ref('structured')
const isEditing = ref(false)
const saving = ref(false)
const keywordsInput = ref('')

const editForm = ref<CorrectionRequest & {
  ocr_result: { raw_text: string; lines: OCRLine[] }
  structured_data: {
    title: string
    date: string
    sender: string
    receiver: string
    signature: string
    content: string
    keywords: string[]
    custom_fields: StructuredField[]
  }
}>({
  ocr_result: { raw_text: '', lines: [] },
  structured_data: {
    title: '',
    date: '',
    sender: '',
    receiver: '',
    signature: '',
    content: '',
    keywords: [],
    custom_fields: []
  },
  correction_note: ''
})

const displayLines = computed(() => {
  if (isEditing.value) {
    return editForm.value.ocr_result.lines
  }
  return props.result?.ocr_result.lines || []
})

const displayCustomFields = computed(() => {
  if (isEditing.value) {
    return editForm.value.structured_data.custom_fields
  }
  return props.result?.structured_data.custom_fields || []
})

const confidenceType = computed(() => {
  if (!props.result) return 'info'
  const conf = props.result.ocr_result.confidence
  if (conf >= 0.8) return 'success'
  if (conf >= 0.6) return 'warning'
  return 'danger'
})

const getConfidenceType = (conf: number) => {
  if (conf >= 0.8) return 'success'
  if (conf >= 0.6) return 'warning'
  return 'danger'
}

const startEditing = () => {
  if (!props.result) return
  
  editForm.value = {
    ocr_result: {
      raw_text: props.result.ocr_result.raw_text,
      lines: JSON.parse(JSON.stringify(props.result.ocr_result.lines))
    },
    structured_data: {
      title: props.result.structured_data.title || '',
      date: props.result.structured_data.date || '',
      sender: props.result.structured_data.sender || '',
      receiver: props.result.structured_data.receiver || '',
      signature: props.result.structured_data.signature || '',
      content: props.result.structured_data.content || '',
      keywords: [...(props.result.structured_data.keywords || [])],
      custom_fields: JSON.parse(JSON.stringify(props.result.structured_data.custom_fields || []))
    },
    correction_note: ''
  }
  
  keywordsInput.value = editForm.value.structured_data.keywords.join(', ')
  isEditing.value = true
}

const cancelEditing = () => {
  isEditing.value = false
}

const updateKeywords = () => {
  editForm.value.structured_data.keywords = keywordsInput.value
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0)
}

const saveCorrection = async () => {
  if (!props.result?._id) {
    ElMessage.error('无法保存：缺少文档ID')
    return
  }
  
  saving.value = true
  try {
    updateKeywords()
    
    const updateData: CorrectionRequest = {
      ocr_result: {
        raw_text: editForm.value.ocr_result.raw_text,
        lines: editForm.value.ocr_result.lines
      },
      structured_data: editForm.value.structured_data,
      correction_note: editForm.value.correction_note
    }
    
    const updated = await documentApi.updateDocument(props.result._id, updateData)
    
    const updatedResult: ProcessResult = {
      ...updated,
      original_image: props.result.original_image,
      preprocessed_image: props.result.preprocessed_image
    }
    
    emit('updated', updatedResult)
    isEditing.value = false
    ElMessage.success('修正已保存')
  } catch (error) {
    console.error('保存修正失败:', error)
    ElMessage.error('保存失败，请重试')
  } finally {
    saving.value = false
  }
}

const copyText = async () => {
  if (!props.result) return
  try {
    await navigator.clipboard.writeText(props.result.ocr_result.raw_text)
    ElMessage.success('文本已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

const exportJson = () => {
  if (!props.result) return
  const dataStr = JSON.stringify(props.result, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${props.result.filename}_result.json`
  link.click()
  URL.revokeObjectURL(url)
}

watch(() => props.result, () => {
  isEditing.value = false
})
</script>

<style scoped>
.result-container {
  min-height: 400px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 350px;
  color: #909399;
}

.loading-icon {
  animation: rotate 1.5s linear infinite;
  margin-bottom: 16px;
  color: #409eff;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-header {
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.result-info {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.keywords-edit {
  width: 100%;
}

.correction-note {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed #ebeef5;
}

.confidence, .time {
  font-size: 13px;
  color: #606266;
}

.result-tabs {
  margin-top: 8px;
}

.raw-text {
  max-height: 300px;
  overflow-y: auto;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 6px;
}

.raw-text pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  line-height: 1.8;
  color: #303133;
}

.lines-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.line-item {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  border-left: 3px solid #409eff;
}

.line-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.line-index {
  font-size: 12px;
  color: #909399;
  font-weight: 600;
}

.line-text {
  font-size: 14px;
  color: #303133;
  line-height: 1.6;
}

.structured-result {
  max-height: 300px;
  overflow-y: auto;
}

.empty-field {
  color: #c0c4cc;
  font-style: italic;
}

.keywords {
  display: flex;
  flex-wrap: wrap;
}

.result-actions {
  display: flex;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

:deep(.el-descriptions__label) {
  width: 100px;
  font-weight: 600;
}
</style>
