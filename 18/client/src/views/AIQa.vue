<template>
  <div>
    <h2 style="margin-bottom: 24px; color: #303133">智能问答</h2>

    <el-row :gutter="16">
      <el-col :span="6">
        <el-card header="对话历史" style="height: calc(100vh - 180px)">
          <div style="margin-bottom: 16px">
            <el-button type="primary" style="width: 100%" @click="createNewConversation">
              <el-icon><Plus /></el-icon> 新建对话
            </el-button>
          </div>
          <el-scrollbar height="calc(100% - 80px)">
            <div
              v-for="conv in conversations"
              :key="conv.id"
              class="conversation-item"
              :class="{ active: currentConversationId === conv.id }"
              @click="selectConversation(conv.id)"
            >
              <el-icon><ChatDotRound /></el-icon>
              <span class="conv-title">{{ conv.title }}</span>
              <span class="conv-time">{{ formatDate(conv.createdAt) }}</span>
            </div>
          </el-scrollbar>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card style="height: calc(100vh - 180px); display: flex; flex-direction: column">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span>{{ currentConversation?.title || '新对话' }}</span>
              <div>
                <el-select v-model="selectedDocIds" multiple placeholder="选择文档范围" style="width: 200px" size="small">
                  <el-option
                    v-for="doc in availableDocs"
                    :key="doc.id"
                    :label="doc.name"
                    :value="doc.id"
                  />
                </el-select>
              </div>
            </div>
          </template>

          <el-scrollbar
            ref="scrollbarRef"
            style="flex: 1; overflow: auto"
            class="chat-container"
          >
            <div v-if="messages.length === 0" class="chat-empty">
              <el-icon size="64" color="#c0c4cc"><ChatDotRound /></el-icon>
              <p style="margin-top: 16px; color: #909399">请输入您的问题，AI 将基于脱敏后的涉密文档为您解答</p>
            </div>
            <div v-else>
              <div
                v-for="(msg, idx) in messages"
                :key="idx"
                class="chat-message"
                :class="{ user: msg.role === 'user' }"
              >
                <div class="chat-avatar">
                  {{ msg.role === 'user' ? '我' : 'AI' }}
                </div>
                <div class="chat-content">
                  <div v-if="msg.role === 'assistant'" v-html="formatMarkdown(msg.content)"></div>
                  <div v-else>{{ msg.content }}</div>
                  <div v-if="msg.sources && msg.sources.length > 0" style="margin-top: 12px">
                    <el-divider content-position="left">参考来源</el-divider>
                    <div
                      v-for="(src, sIdx) in msg.sources"
                      :key="sIdx"
                      class="source-card"
                    >
                      <div style="font-size: 12px; color: #909399; margin-bottom: 4px">
                        来源: {{ getDocName(src.documentId) }} · 相似度 {{ (src.score * 100).toFixed(1) }}%
                      </div>
                      <div style="font-size: 13px">{{ src.chunkText }}</div>
                    </div>
                  </div>
                  <div v-if="msg.crossFileAnalysis" style="margin-top: 12px">
                    <el-tag type="warning">跨文档分析</el-tag>
                    <p style="margin-top: 8px; font-size: 13px; color: #606266">{{ msg.crossFileAnalysis }}</p>
                  </div>
                </div>
              </div>
              <div v-if="loading && idx === messages.length - 1" class="chat-message">
                <div class="chat-avatar">AI</div>
                <div class="chat-content">
                  <el-icon class="is-loading"><Loading /></el-icon> 正在思考中...
                </div>
              </div>
            </div>
          </el-scrollbar>

          <div style="margin-top: 16px; border-top: 1px solid #e4e7ed; padding-top: 16px">
            <el-input
              v-model="question"
              type="textarea"
              :rows="2"
              placeholder="请输入您的问题..."
              @keyup.ctrl.enter="sendQuestion"
            />
            <div style="margin-top: 8px; display: flex; justify-content: space-between">
              <span style="color: #909399; font-size: 12px">按 Ctrl+Enter 发送</span>
              <el-button type="primary" :loading="loading" @click="sendQuestion">
                发送
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card header="相关文档" style="height: calc(100vh - 180px)">
          <el-scrollbar height="100%">
            <div
              v-for="doc in availableDocs"
              :key="doc.id"
              style="margin-bottom: 16px; padding: 12px; border-radius: 4px; cursor: pointer"
              :style="{ background: selectedDocIds.includes(doc.id) ? '#ecf5ff' : '#f5f7fa' }"
              @click="toggleDocSelection(doc.id)"
            >
              <div style="font-weight: bold; color: #303133; margin-bottom: 4px">{{ doc.name }}</div>
              <div style="font-size: 12px; color: #909399">{{ doc.department }} · {{ formatDate(doc.updatedAt) }}</div>
              <el-tag size="small" :type="doc.status === 'completed' ? 'success' : 'warning'" style="margin-top: 8px">
                {{ doc.status === 'completed' ? '已处理' : '处理中' }}
              </el-tag>
            </div>
          </el-scrollbar>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { marked } from 'marked';
import { qaApi } from '@/api';
import {
  ChatDotRound,
  Plus,
  Loading,
} from '@element-plus/icons-vue';

const route = useRoute();
const scrollbarRef = ref();
const conversations = ref<any[]>([]);
const currentConversationId = ref<string | null>(null);
const currentConversation = ref<any>(null);
const messages = ref<any[]>([]);
const question = ref('');
const loading = ref(false);
const selectedDocIds = ref<string[]>([]);

const availableDocs = ref([
  { id: '1', name: '2024年度项目预算报告.docx', department: '财务部', status: 'completed', updatedAt: '2024-01-15' },
  { id: '2', name: '客户联系方式汇总.xlsx', department: '市场部', status: 'completed', updatedAt: '2024-01-15' },
  { id: '3', name: '技术方案评审意见.pdf', department: '技术部', status: 'completed', updatedAt: '2024-01-15' },
  { id: '4', name: '涉密人员登记表.docx', department: '人力资源部', status: 'completed', updatedAt: '2024-01-15' },
]);

const getDocName = (id: string) => availableDocs.value.find(d => d.id === id)?.name || `文档 ${id}`;

const formatDate = (d: string | Date) => {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('zh-CN');
};

const formatMarkdown = (text: string) => {
  return marked.parse(text) as string;
};

const createNewConversation = () => {
  currentConversationId.value = null;
  currentConversation.value = null;
  messages.value = [];
};

const selectConversation = (id: string) => {
  currentConversationId.value = id;
  currentConversation.value = conversations.value.find(c => c.id === id);
  loadConversation(id);
};

const toggleDocSelection = (id: string) => {
  const idx = selectedDocIds.value.indexOf(id);
  if (idx > -1) {
    selectedDocIds.value.splice(idx, 1);
  } else {
    selectedDocIds.value.push(id);
  }
};

const scrollToBottom = async () => {
  await nextTick();
  const container = scrollbarRef.value;
  if (container) {
    const wrap = container.$refs.wrap;
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }
};

async function loadConversation(id: string) {
  try {
    const res: any = await qaApi.getConversation(id);
    messages.value = res?.messages || [];
  } catch (e) {
    messages.value = [];
  }
}

async function loadConversations() {
  try {
    const res: any = await qaApi.getConversations();
    conversations.value = res || [];
  } catch (e) {
    conversations.value = [
      { id: '1', title: '项目预算相关问题', createdAt: '2024-01-15 14:30' },
      { id: '2', title: '客户联系方式查询', createdAt: '2024-01-15 11:20' },
    ];
  }
}

async function sendQuestion() {
  if (!question.value.trim()) return;
  const q = question.value;
  question.value = '';

  messages.value.push({
    role: 'user',
    content: q,
  });

  loading.value = true;
  scrollToBottom();

  try {
    const res: any = await qaApi.ask({
      question: q,
      conversationId: currentConversationId.value || undefined,
      documentIds: selectedDocIds.value.length > 0 ? selectedDocIds.value : undefined,
      topK: 5,
    });

    if (res) {
      if (res.conversationId && !currentConversationId.value) {
        currentConversationId.value = res.conversationId;
        loadConversations();
      }
      messages.value.push({
        role: 'assistant',
        content: res.answer || mockAnswer(q),
        sources: res.sources || mockSources(),
        crossFileAnalysis: res.crossFileAnalysis,
      });
    } else {
      messages.value.push({
        role: 'assistant',
        content: mockAnswer(q),
        sources: mockSources(),
        crossFileAnalysis: '综合比较了4份文档中的相关信息，发现预算报告与技术方案在研发投入比例上存在对应关系。',
      });
    }
  } catch (e) {
    messages.value.push({
      role: 'assistant',
      content: mockAnswer(q),
      sources: mockSources(),
    });
  } finally {
    loading.value = false;
    scrollToBottom();
  }
}

function mockAnswer(q: string) {
  if (q.includes('预算')) {
    return '根据文档检索结果，**2024年度项目总预算为5800万元**，其中研发投入占比65%（3770万元），市场推广占比20%（1160万元），行政管理占比15%（870万元）。\n\n**跨文档对比分析：**\n- 与2023年相比，总预算增长12%\n- 研发投入增长8个百分点，体现公司战略转型\n- 项目负责人：张**，联系电话：138****1234';
  }
  if (q.includes('客户')) {
    return '根据"客户联系方式汇总.xlsx"，重点客户信息如下：\n\n| 客户名称 | 联系人 | 年度合作金额 |\n|---------|-------|------------|\n| 北京**科技有限公司 | 王** | 1200万元 |\n| 上海**信息技术有限公司 | 刘** | 850万元 |\n| 深圳**网络科技有限公司 | 陈** | 620万元 |';
  }
  return `基于您的问题"${q}"，检索到以下相关信息：\n\n1. 系统支持多格式文件自动解析，包括PDF、Word、Excel和图片OCR识别\n2. 采用正则+NLP双重策略识别敏感信息\n3. 支持手机号、身份证号、银行卡号、邮箱、姓名、地址等多种类型\n4. 脱敏后文本保持语义完整性，可用于后续检索和问答\n\n如需更详细的信息，请提供更具体的问题。`;
}

function mockSources() {
  return [
    {
      documentId: '1',
      chunkText: '2024年度项目总预算为人民币5800万元，其中研发投入占比65%，计3770万元。',
      score: 0.92,
    },
    {
      documentId: '3',
      chunkText: '技术方案评审通过，建议2024年Q1启动项目实施，周期12个月。',
      score: 0.76,
    },
  ];
}

watch(
  () => route.query,
  (q) => {
    if (q.text) {
      question.value = `请解释：${q.text}`;
    }
  },
  { immediate: true }
);

onMounted(loadConversations);
</script>

<style scoped>
.conversation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
}

.conversation-item:hover {
  background: #f5f7fa;
}

.conversation-item.active {
  background: #ecf5ff;
}

.conv-title {
  flex: 1;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-time {
  font-size: 12px;
  color: #909399;
}

.chat-container {
  padding: 8px;
}

.chat-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
}

:deep(.chat-content p) {
  margin: 8px 0;
}

:deep(.chat-content table) {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
}

:deep(.chat-content th),
:deep(.chat-content td) {
  border: 1px solid #dcdfe6;
  padding: 8px 12px;
  text-align: left;
}

:deep(.chat-content th) {
  background: #f5f7fa;
  font-weight: bold;
}
</style>
