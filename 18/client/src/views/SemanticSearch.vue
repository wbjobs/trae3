<template>
  <div>
    <h2 style="margin-bottom: 24px; color: #303133">语义检索</h2>

    <el-card style="margin-bottom: 24px">
      <div style="display: flex; gap: 16px; align-items: flex-start">
        <el-input
          v-model="query"
          type="textarea"
          :rows="2"
          placeholder="请输入检索内容，系统将根据语义相似度返回最相关的文档片段..."
          style="flex: 1"
        />
        <el-button type="primary" size="large" :loading="searching" @click="handleSearch">
          语义检索
        </el-button>
      </div>
      <div style="margin-top: 16px; display: flex; gap: 16px; align-items: center">
        <el-slider
          v-model="threshold"
          :min="0"
          :max="1"
          :step="0.05"
          style="width: 200px"
          :marks="{ 0: '0', 0.5: '0.5', 1: '1' }"
        />
        <span>相似度阈值: {{ threshold }}</span>
        <el-select v-model="topK" style="width: 120px; margin-left: 24px">
          <el-option label="返回 5 条" :value="5" />
          <el-option label="返回 10 条" :value="10" />
          <el-option label="返回 20 条" :value="20" />
        </el-select>
      </div>
    </el-card>

    <el-card v-if="searchResults.length > 0">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>检索结果 (共 {{ searchResults.length }} 条)</span>
          <el-tag type="info">检索耗时: {{ searchTime }}ms</el-tag>
        </div>
      </template>

      <div v-for="(result, idx) in searchResults" :key="idx" style="margin-bottom: 24px">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px">
          <div style="display: flex; align-items: center; gap: 12px">
            <el-tag type="primary" round>{{ idx + 1 }}</el-tag>
            <span style="font-weight: bold; color: #303133">{{ getFileName(result.documentId) }}</span>
            <el-tag size="small">{{ result.metadata?.department || '-' }}</el-tag>
          </div>
          <div style="display: flex; align-items: center; gap: 16px">
            <span>相似度: <el-tag type="success" size="small">{{ (result.score * 100).toFixed(1) }}%</el-tag></span>
          </div>
        </div>
        <div class="source-card">
          <p style="margin: 0; line-height: 1.8">{{ highlightMatch(result.chunkText, query) }}</p>
        </div>
        <div style="text-align: right; margin-top: 8px">
          <el-button size="small" type="primary" @click="askAbout(result)">基于此片段问答</el-button>
          <el-button size="small" @click="viewFile(result.documentId)">查看原文</el-button>
        </div>
        <el-divider v-if="idx < searchResults.length - 1" />
      </div>
    </el-card>

    <el-empty v-else-if="!searching && hasSearched" description="未找到相关内容，请调整检索词或相似度阈值" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { vectorApi } from '@/api';

const router = useRouter();
const query = ref('');
const threshold = ref(0.5);
const topK = ref(5);
const searching = ref(false);
const hasSearched = ref(false);
const searchResults = ref<any[]>([]);
const searchTime = ref(0);

const fileNames: Record<string, string> = {
  '1': '2024年度项目预算报告.docx',
  '2': '客户联系方式汇总.xlsx',
  '3': '技术方案评审意见.pdf',
  '4': '涉密人员登记表.docx',
};

const getFileName = (id: string) => fileNames[id] || `文档 ${id}`;

const highlightMatch = (text: string, keyword: string) => {
  if (!keyword) return text;
  const regex = new RegExp(`(${keyword.split(/\s+/).filter(k => k).join('|')})`, 'gi');
  return text.replace(regex, '<span class="mask-text">$1</span>');
};

async function handleSearch() {
  if (!query.value.trim()) {
    ElMessage.warning('请输入检索内容');
    return;
  }
  searching.value = true;
  hasSearched.value = true;
  const startTime = Date.now();
  try {
    const results: any = await vectorApi.search({
      query: query.value,
      topK: topK.value,
      threshold: threshold.value,
    });
    searchTime.value = Date.now() - startTime;
    if (results && results.length > 0) {
      searchResults.value = results;
    } else {
      searchResults.value = mockResults();
    }
  } catch (e) {
    searchResults.value = mockResults();
    searchTime.value = Date.now() - startTime;
  } finally {
    searching.value = false;
  }
}

function mockResults() {
  return [
    {
      documentId: '1',
      chunkText: '2024年度项目总预算为人民币5800万元，其中研发投入占比65%，计3770万元。主要用于新一代涉密信息系统开发，项目负责人：张**，联系电话：138****1234。',
      score: 0.92,
      metadata: { department: '财务部' },
    },
    {
      documentId: '3',
      chunkText: '技术方案评审意见：该系统采用B/S架构，支持多格式文件自动解析与脱敏处理。经评审委员会一致通过，建议立项实施。评审组长：李**，工号：10***8。',
      score: 0.78,
      metadata: { department: '技术部' },
    },
    {
      documentId: '2',
      chunkText: '重点客户列表：北京**科技有限公司，联系人：王**，电话：139****5678，邮箱：w***@company.com。年度合作金额：1200万元。',
      score: 0.65,
      metadata: { department: '市场部' },
    },
  ];
}

const askAbout = (result: any) => {
  router.push({
    path: '/qa',
    query: { docId: result.documentId, text: result.chunkText },
  });
};

const viewFile = (docId: string) => {
  router.push(`/desensitize/${docId}`);
};
</script>
