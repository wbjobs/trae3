<template>
  <div>
    <h2 style="margin-bottom: 24px; color: #303133">数据概览</h2>

    <el-row :gutter="16" style="margin-bottom: 24px">
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-value" style="color: #409eff">{{ stats.totalFiles }}</div>
          <div class="stat-label">文件总数</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-value" style="color: #e6a23c">{{ stats.desensitizedCount }}</div>
          <div class="stat-label">已脱敏文件</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-value" style="color: #67c23a">{{ stats.embeddedCount }}</div>
          <div class="stat-label">已向量化</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-value" style="color: #f56c6c">{{ stats.totalSensitiveMatches }}</div>
          <div class="stat-label">敏感信息发现</div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="12">
        <el-card header="最近处理任务">
          <el-table :data="recentTasks" height="320">
            <el-table-column prop="filename" label="文件名" />
            <el-table-column prop="step" label="处理阶段">
              <template #default="{ row }">
                <el-tag :type="statusType[row.step]">{{ statusText[row.step] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="progress" label="进度">
              <template #default="{ row }">
                <el-progress :percentage="row.progress" :stroke-width="10" />
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="时间" width="180" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card header="敏感信息类型分布">
          <div style="padding: 20px">
            <div
              v-for="(value, key) in sensitiveTypeStats"
              :key="key"
              style="margin-bottom: 16px"
            >
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px">
                <span>{{ sensitiveTypeName[key] || key }}</span>
                <span>{{ value }} 处</span>
              </div>
              <el-progress
                :percentage="(value / (stats.totalSensitiveMatches || 1)) * 100"
                :stroke-width="12"
                :color="typeColor[key]"
                :show-text="false"
              />
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top: 24px">
      <el-col :span="24">
        <el-card header="系统模块状态">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="文件解析模块">
              <el-tag type="success">运行中</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="内容脱敏模块">
              <el-tag type="success">运行中</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="向量嵌入模块">
              <el-tag type="success">运行中</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="AI 问答推理模块">
              <el-tag type="success">运行中</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="内网权限模块">
              <el-tag type="success">运行中</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="存储模块">
              <el-tag type="success">运行中</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { vectorApi } from '@/api';

const stats = ref({
  totalFiles: 0,
  desensitizedCount: 0,
  embeddedCount: 0,
  totalSensitiveMatches: 0,
});

const sensitiveTypeStats = ref<Record<string, number>>({
  phone: 0,
  id_card: 0,
  bank_card: 0,
  email: 0,
  name: 0,
  address: 0,
  classified: 0,
  ip_address: 0,
});

const sensitiveTypeName: Record<string, string> = {
  phone: '手机号码',
  id_card: '身份证号',
  bank_card: '银行卡号',
  email: '电子邮箱',
  name: '个人姓名',
  address: '地理地址',
  classified: '涉密标识',
  ip_address: 'IP 地址',
};

const typeColor: Record<string, string> = {
  phone: '#409eff',
  id_card: '#67c23a',
  bank_card: '#e6a23c',
  email: '#f56c6c',
  name: '#909399',
  address: '#8e44ad',
  classified: '#c0392b',
  ip_address: '#16a085',
};

const recentTasks = ref([
  { filename: '2024年度项目预算报告.docx', step: 'completed', progress: 100, createdAt: '2024-01-15 14:30' },
  { filename: '客户联系方式汇总.xlsx', step: 'completed', progress: 100, createdAt: '2024-01-15 11:20' },
  { filename: '技术方案评审意见.pdf', step: 'completed', progress: 100, createdAt: '2024-01-15 10:05' },
  { filename: '涉密人员登记表.docx', step: 'desensitized', progress: 65, createdAt: '2024-01-15 09:30' },
]);

const statusType: Record<string, string> = {
  upload: 'info',
  parsing: 'warning',
  parsed: 'success',
  desensitizing: 'warning',
  desensitized: 'success',
  embedding: 'warning',
  embedded: 'success',
  completed: 'success',
  failed: 'danger',
};

const statusText: Record<string, string> = {
  upload: '上传中',
  parsing: '解析中',
  parsed: '已解析',
  desensitizing: '脱敏中',
  desensitized: '已脱敏',
  embedding: '向量化中',
  embedded: '已向量化',
  completed: '已完成',
  failed: '失败',
};

onMounted(async () => {
  try {
    const vecStats: any = await vectorApi.getStats();
    if (vecStats && vecStats.length > 0) {
      stats.value.embeddedCount = vecStats[0].count;
    }
  } catch (e) {
    console.log('Load stats failed, using mock data');
  }
  stats.value.totalFiles = 128;
  stats.value.desensitizedCount = 112;
  stats.value.totalSensitiveMatches = 856;
  sensitiveTypeStats.value = {
    phone: 234,
    id_card: 156,
    bank_card: 89,
    email: 178,
    name: 120,
    address: 45,
    classified: 23,
    ip_address: 11,
  };
});
</script>
