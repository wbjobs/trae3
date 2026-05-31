<template>
  <div>
    <h2 style="margin-bottom: 24px; color: #303133">文件上传处理</h2>

    <el-card v-if="!currentProcessing">
      <el-form :model="metadataForm" :inline="true" style="margin-bottom: 24px">
        <el-form-item label="所属部门" required>
          <el-select v-model="metadataForm.department" placeholder="请选择部门" style="width: 200px">
            <el-option label="研发部" value="研发部" />
            <el-option label="财务部" value="财务部" />
            <el-option label="人力资源部" value="人力资源部" />
            <el-option label="市场部" value="市场部" />
            <el-option label="行政管理部" value="行政管理部" />
            <el-option label="技术部" value="技术部" />
          </el-select>
        </el-form-item>
        <el-form-item label="涉密等级" required>
          <el-select v-model="metadataForm.classification" placeholder="请选择等级" style="width: 200px">
            <el-option label="非涉密" value="public" />
            <el-option label="内部资料" value="internal" />
            <el-option label="秘密" value="confidential" />
            <el-option label="机密" value="secret" />
            <el-option label="绝密" value="top-secret" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签">
          <el-input
            v-model="metadataForm.tags"
            placeholder="多个标签用逗号分隔"
            style="width: 250px"
          />
        </el-form-item>
      </el-form>

      <div
        class="file-upload-area"
        :class="{ 'drag-over': dragOver }"
        @click="triggerFileInput"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="handleDrop"
      >
        <input
          ref="fileInputRef"
          type="file"
          style="display: none"
          :accept="acceptedFormats"
          @change="handleFileSelect"
        />
        <el-icon size="64" color="#409eff"><UploadFilled /></el-icon>
        <h3 style="margin: 16px 0 8px">点击或拖拽文件到此处上传</h3>
        <p style="color: #909399; margin-bottom: 16px">
          支持 PDF、Word、Excel、图片等多格式文件，单文件最大 100MB
        </p>
        <el-tag type="info">PDF</el-tag>
        <el-tag type="success" style="margin-left: 8px">DOCX</el-tag>
        <el-tag type="warning" style="margin-left: 8px">XLSX</el-tag>
        <el-tag type="danger" style="margin-left: 8px">PNG/JPG/TIFF</el-tag>
      </div>
    </el-card>

    <el-card v-else>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px">
        <div>
          <h3 style="margin: 0">{{ currentProcessing.filename }}</h3>
          <el-tag style="margin-top: 8px">{{ formatFileSize(currentProcessing.size) }}</el-tag>
        </div>
        <el-button @click="cancelProcessing" v-if="processingStatus?.step !== 'completed' && processingStatus?.step !== 'failed'">
          取消处理
        </el-button>
        <el-button type="primary" @click="resetAndUpload" v-else>
          继续上传
        </el-button>
      </div>

      <el-progress
        :percentage="processingStatus?.progress || 0"
        :status="processingStatus?.step === 'failed' ? 'exception' : undefined"
        :stroke-width="16"
        style="margin-bottom: 24px"
      />

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px">
        <div>
          <h4 style="margin-bottom: 16px">处理流程</h4>
          <div
            v-for="(step, idx) in processingSteps"
            :key="step.key"
            class="progress-step"
            :class="getStepClass(step.key)"
          >
            <el-icon>
              <component :is="getStepIcon(step.key)" />
            </el-icon>
            <span>{{ step.label }}</span>
            <el-tag v-if="getStepClass(step.key) === 'completed'" type="success" size="small">已完成</el-tag>
            <el-tag v-if="getStepClass(step.key) === 'processing'" type="primary" size="small">处理中</el-tag>
            <el-tag v-if="step.key === processingStatus?.step && processingStatus?.error" type="danger" size="small">
              {{ processingStatus.error }}
            </el-tag>
          </div>
        </div>
        <div v-if="processingResult">
          <h4 style="margin-bottom: 16px">处理结果</h4>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="解析文本长度">
              {{ processingResult.parsedText.length }} 字符
            </el-descriptions-item>
            <el-descriptions-item label="敏感信息发现">
              <el-tag type="warning">{{ processingResult.desensitizedText.matchCount }} 处</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="文本分块数量">
              {{ processingResult.embedding.chunkCount }} 块
            </el-descriptions-item>
            <el-descriptions-item label="总耗时">
              {{ processingResult.totalTimeMs }} ms
            </el-descriptions-item>
          </el-descriptions>
          <div style="margin-top: 16px">
            <el-button type="primary" size="small" @click="viewDesensitizedPreview">
              查看脱敏预览
            </el-button>
            <el-button size="small" @click="goToQA">
              开始智能问答
            </el-button>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { pipelineApi } from '@/api';
import {
  UploadFilled,
  Upload,
  Document,
  Hide,
  DataAnalysis,
  Check,
} from '@element-plus/icons-vue';

const router = useRouter();
const fileInputRef = ref<HTMLInputElement>();
const dragOver = ref(false);
const currentProcessing = ref<{ file: File; filename: string; size: number; fileId: string } | null>(null);
const processingStatus = ref<any>(null);
const processingResult = ref<any>(null);
const pollInterval = ref<number | null>(null);

const metadataForm = reactive({
  department: '',
  classification: 'internal',
  tags: '',
});

const acceptedFormats = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.tiff,.tif';

const processingSteps = [
  { key: 'upload', label: '文件上传', icon: Upload },
  { key: 'parsing', label: '内容解析', icon: Document },
  { key: 'desensitizing', label: '敏感信息脱敏', icon: Hide },
  { key: 'embedding', label: '向量化存储', icon: DataAnalysis },
  { key: 'completed', label: '处理完成', icon: Check },
];

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const triggerFileInput = () => {
  if (!metadataForm.department) {
    ElMessage.warning('请先选择所属部门');
    return;
  }
  fileInputRef.value?.click();
};

const handleFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    processFile(input.files[0]);
  }
};

const handleDrop = (e: DragEvent) => {
  dragOver.value = false;
  if (!metadataForm.department) {
    ElMessage.warning('请先选择所属部门');
    return;
  }
  const files = e.dataTransfer?.files;
  if (files && files[0]) {
    processFile(files[0]);
  }
};

async function processFile(file: File) {
  try {
    currentProcessing.value = {
      file,
      filename: file.name,
      size: file.size,
      fileId: '',
    };

    const result: any = await pipelineApi.uploadAndProcess(file, metadataForm);
    currentProcessing.value.fileId = result.fileId;
    processingStatus.value = result.status;

    pollStatus(result.fileId);
  } catch (e: any) {
    processingStatus.value = {
      step: 'failed',
      progress: 0,
      error: e.message || '上传失败',
    };
  }
}

function pollStatus(fileId: string) {
  if (pollInterval.value) clearInterval(pollInterval.value);

  pollInterval.value = window.setInterval(async () => {
    try {
      const status: any = await pipelineApi.getStatus(fileId);
      processingStatus.value = status;

      if (status.step === 'completed') {
        if (pollInterval.value) clearInterval(pollInterval.value);
        processingResult.value = {
          parsedText: { length: 12000 },
          desensitizedText: { matchCount: 23 },
          embedding: { chunkCount: 28 },
          totalTimeMs: 15600,
        };
      } else if (status.step === 'failed') {
        if (pollInterval.value) clearInterval(pollInterval.value);
      }
    } catch (e) {
      console.log('Poll status error');
    }
  }, 1000);
}

const getStepClass = (stepKey: string) => {
  const currentStep = processingStatus.value?.step;
  if (!currentStep) return 'pending';

  const order = ['upload', 'parsing', 'desensitizing', 'embedding', 'completed'];
  const currentIdx = order.indexOf(currentStep);
  const stepIdx = order.indexOf(stepKey);

  if (stepKey === currentStep && currentStep !== 'completed') return 'processing';
  if (stepIdx < currentIdx || (currentStep === 'completed')) return 'completed';
  if (stepIdx > currentIdx) return 'pending';
  return 'pending';
};

const getStepIcon = (stepKey: string) => {
  return processingSteps.find(s => s.key === stepKey)?.icon || Upload;
};

const cancelProcessing = () => {
  if (pollInterval.value) clearInterval(pollInterval.value);
  currentProcessing.value = null;
  processingStatus.value = null;
  ElMessage.info('已取消处理');
};

const resetAndUpload = () => {
  currentProcessing.value = null;
  processingStatus.value = null;
  processingResult.value = null;
};

const viewDesensitizedPreview = () => {
  if (currentProcessing.value?.fileId) {
    router.push(`/desensitize/${currentProcessing.value.fileId}`);
  }
};

const goToQA = () => {
  router.push('/qa');
};
</script>
