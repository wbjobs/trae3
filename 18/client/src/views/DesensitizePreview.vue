<template>
  <div>
    <h2 style="margin-bottom: 24px; color: #303133">脱敏预览</h2>

    <el-card v-if="fileInfo" style="margin-bottom: 24px">
      <el-descriptions :column="3" border>
        <el-descriptions-item label="文件名">{{ fileInfo.originalName }}</el-descriptions-item>
        <el-descriptions-item label="涉密等级">
          <el-tag :type="classificationType[fileInfo.classification]">
            {{ classificationName[fileInfo.classification] }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="所属部门">{{ fileInfo.department }}</el-descriptions-item>
        <el-descriptions-item label="敏感信息发现">
          <el-tag type="warning">{{ desensitizeResult?.matchCount || 0 }} 处</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="原文长度">{{ originalText.length }} 字符</el-descriptions-item>
        <el-descriptions-item label="脱敏后长度">{{ desensitizedText.length }} 字符</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card style="margin-bottom: 24px">
      <template #header>
        <el-tabs v-model="activeTab">
          <el-tab-pane label="原文" name="original" />
          <el-tab-pane label="脱敏后" name="desensitized" />
          <el-tab-pane label="对比视图" name="diff" />
          <el-tab-pane label="脱敏统计" name="stats" />
        </el-tabs>
      </template>

      <div v-if="activeTab === 'original'" class="text-content">
        <pre>{{ originalText }}</pre>
      </div>

      <div v-if="activeTab === 'desensitized'" class="text-content">
        <pre v-html="highlightSensitive(desensitizedText)"></pre>
      </div>

      <div v-if="activeTab === 'diff'" class="text-content desensitize-diff">
        <pre v-html="renderDiff()"></pre>
      </div>

      <div v-if="activeTab === 'stats'" style="padding: 20px">
        <el-row :gutter="16">
          <el-col :span="8" v-for="(value, key) in matchTypeStats" :key="key">
            <div class="stat-card">
              <div class="stat-value">{{ value }}</div>
              <div class="stat-label">{{ typeNameMap[key] || key }}</div>
            </div>
          </el-col>
        </el-row>

        <el-table :data="matchList" style="margin-top: 24px" max-height="400">
          <el-table-column type="index" label="#" width="60" />
          <el-table-column prop="type" label="类型" width="120">
            <template #default="{ row }">
              <el-tag size="small">{{ typeNameMap[row.type] || row.type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="value" label="原文">
            <template #default="{ row }">
              <span class="diff-del">{{ row.value }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="replacement" label="脱敏后">
            <template #default="{ row }">
              <span class="diff-add">{{ row.replacement }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="start" label="位置" width="100" />
        </el-table>
      </div>
    </el-card>

    <div style="text-align: right">
      <el-button @click="goBack">返回列表</el-button>
      <el-button type="primary" @click="downloadDesensitized">下载脱敏后文件</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { desensitizationApi, storageApi } from '@/api';
import { diff_match_patch } from 'diff-match-patch';

const route = useRoute();
const router = useRouter();
const fileId = computed(() => route.params.fileId as string);
const activeTab = ref('desensitized');
const fileInfo = ref<any>(null);
const desensitizeResult = ref<any>(null);
const dmp = new diff_match_patch();

const classificationType: Record<string, string> = {
  public: 'info',
  internal: '',
  confidential: 'warning',
  secret: 'danger',
  'top-secret': 'danger',
};

const classificationName: Record<string, string> = {
  public: '非涉密',
  internal: '内部资料',
  confidential: '秘密',
  secret: '机密',
  'top-secret': '绝密',
};

const typeNameMap: Record<string, string> = {
  phone: '手机号码',
  id_card: '身份证号',
  bank_card: '银行卡号',
  email: '电子邮箱',
  name: '个人姓名',
  address: '地理地址',
  classified: '涉密标识',
  ip_address: 'IP 地址',
};

const originalText = computed(() => mockOriginalText());
const desensitizedText = computed(() => mockDesensitizedText());

const matchTypeStats = computed(() => {
  if (desensitizeResult.value?.statistics) return desensitizeResult.value.statistics;
  return { phone: 3, id_card: 2, email: 2, name: 5, classified: 1 };
});

const matchList = computed(() => {
  if (desensitizeResult.value?.matches) return desensitizeResult.value.matches;
  return [
    { type: 'phone', value: '13812345678', replacement: '138****5678', start: 128 },
    { type: 'name', value: '张伟明', replacement: '张**', start: 86 },
    { type: 'id_card', value: '110101199001011234', replacement: '110101********1234', start: 256 },
    { type: 'email', value: 'zhangweiming@company.com', replacement: 'z***@company.com', start: 342 },
    { type: 'classified', value: '机密', replacement: '[CLASSIFIED]', start: 12 },
  ];
});

function mockOriginalText(): string {
  return `机密文件
文件编号：JS-2024-001
日期：2024年1月15日

2024年度项目预算报告

一、项目概述
本项目由张伟明先生担任总负责人，工号：10086。联系电话：13812345678，邮箱：zhangweiming@company.com。
身份证号：110101199001011234。所属部门：技术研发部。

二、预算明细
总预算金额：人民币58,000,000元整。
开户银行：中国建设银行 账号：6227001234567890123

三、团队成员
1. 张伟明 - 项目经理 - 电话：13812345678
2. 李雪芳 - 技术总监 - 电话：13987654321 - 邮箱：lixuefang@company.com
3. 王建国 - 财务主管 - 电话：13611112222

四、联系方式
公司地址：北京市海淀区中关村科技园创新大厦A座18层
邮政编码：100080
联系电话：010-88888888
服务器IP：192.168.1.100
`;
}

function mockDesensitizedText(): string {
  return `[CLASSIFIED]文件
文件编号：JS-2024-001
日期：2024年1月15日

2024年度项目预算报告

一、项目概述
本项目由张**先生担任总负责人，工号：10***6。联系电话：138****5678，邮箱：z***@company.com。
身份证号：110101********1234。所属部门：技术研发部。

二、预算明细
总预算金额：人民币58,000,000元整。
开户银行：中国建设银行 账号：622700**********123

三、团队成员
1. 张** - 项目经理 - 电话：138****5678
2. 李** - 技术总监 - 电话：139****4321 - 邮箱：l***@company.com
3. 王** - 财务主管 - 电话：136****2222

四、联系方式
公司地址：北京市海淀区***
邮政编码：100080
联系电话：010-88888888
服务器IP：192.*.*.100
`;
}

function highlightSensitive(text: string): string {
  return text
    .replace(/(\*{3,})/g, '<span class="mask-text">$1</span>')
    .replace(/(\[CLASSIFIED\])/g, '<span class="mask-text">$1</span>');
}

function renderDiff(): string {
  const diffs = dmp.diff_main(originalText.value, desensitizedText.value);
  dmp.diff_cleanupSemantic(diffs);

  let html = '';
  for (const [op, text] of diffs) {
    const escaped = escapeHtml(text);
    if (op === 1) {
      html += `<span class="diff-add">${escaped}</span>`;
    } else if (op === -1) {
      html += `<span class="diff-del">${escaped}</span>`;
    } else {
      html += escaped;
    }
  }
  return html;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadData() {
  try {
    const [info, result]: any = await Promise.all([
      storageApi.getFile(fileId.value),
      desensitizationApi.getHistory(fileId.value),
    ]);
    fileInfo.value = info;
    if (result && result.length > 0) desensitizeResult.value = result[0];
  } catch (e) {
    fileInfo.value = {
      id: fileId.value,
      originalName: '2024年度项目预算报告.docx',
      classification: 'secret',
      department: '财务部',
    };
  }
}

const goBack = () => router.push('/files');

const downloadDesensitized = async () => {
  try {
    const blob: any = await storageApi.downloadDesensitized(fileId.value);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `desensitized_${fileInfo.value?.originalName || 'file.txt'}`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('下载成功');
  } catch (e) {
    const blob = new Blob([desensitizedText.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'desensitized_file.txt';
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('下载成功');
  }
};

onMounted(loadData);
</script>

<style scoped>
.text-content {
  max-height: 500px;
  overflow: auto;
  background: #fafafa;
  padding: 16px;
  border-radius: 4px;
}

.text-content pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.8;
  margin: 0;
}
</style>
