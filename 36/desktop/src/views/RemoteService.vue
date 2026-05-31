<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useConfigStore } from '@/stores/configStore';
import { useProjectStore } from '@/stores/projectStore';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FirmwareArchive, LogEntry } from '@shared/types';
import { httpClient } from '@/api/httpClient';
import { formatFileSize, formatDate } from '@shared/utils';

const configStore = useConfigStore();
const projectStore = useProjectStore();

const currentTab = ref<'archive' | 'logs' | 'server'>('archive');
const isLoading = ref(false);
const archives = ref<FirmwareArchive[]>([]);
const logs = ref<LogEntry[]>([]);
const selectedArchive = ref<FirmwareArchive | null>(null);
const showUploadDialog = ref(false);
const showLogDetail = ref(false);
const currentLogContent = ref('');
const uploadProgress = ref(0);
const isUploading = ref(false);
const logFilters = ref({
  page: 1,
  pageSize: 20,
  level: '',
  projectId: ''
});

const serverStatus = computed(() => ({
  connected: configStore.isConnected,
  url: configStore.serverUrl,
  host: configStore.config.server.host,
  port: configStore.config.server.port
}));

const filteredLogs = computed(() => {
  let result = [...logs.value];
  
  if (logFilters.value.level) {
    result = result.filter(l => l.level === logFilters.value.level);
  }
  
  if (logFilters.value.projectId) {
    result = result.filter(l => l.projectId === logFilters.value.projectId);
  }
  
  return result;
});

async function loadArchives() {
  if (!configStore.isConnected) return;
  
  isLoading.value = true;
  try {
    const response = await httpClient.getFirmwareList({
      page: logFilters.value.page,
      pageSize: 100
    });
    archives.value = response.items;
  } catch (error) {
    ElMessage.error('加载固件归档失败');
    console.error(error);
  } finally {
    isLoading.value = false;
  }
}

async function loadLogs() {
  if (!configStore.isConnected) return;
  
  isLoading.value = true;
  try {
    const response = await httpClient.getLogs({
      page: logFilters.value.page,
      pageSize: logFilters.value.pageSize,
      level: logFilters.value.level || undefined,
      projectId: logFilters.value.projectId || undefined
    });
    logs.value = response.items;
  } catch (error) {
    ElMessage.error('加载日志失败');
    console.error(error);
  } finally {
    isLoading.value = false;
  }
}

async function testConnection() {
  try {
    const health = await httpClient.healthCheck();
    configStore.setConnected(true);
    ElMessage.success(`连接成功! 服务版本: ${health.version}`);
    loadArchives();
    loadLogs();
  } catch (error) {
    configStore.setConnected(false);
    ElMessage.error('连接失败: ' + (error as Error).message);
  }
}

function disconnect() {
  configStore.setConnected(false);
  ElMessage.info('已断开连接');
}

async function uploadFirmware() {
  const files = await window.electronAPI.dialog.openFile([
    { name: '固件文件', extensions: ['bin', 'hex', 'elf', 'axf'] }
  ]);
  
  if (!files || files.length === 0) return;
  
  const filePath = files[0];
  const filename = await window.electronAPI.path.basename(filePath);
  
  try {
    isUploading.value = true;
    uploadProgress.value = 0;
    
    const project = projectStore.projects[0];
    const projectId = project?.id || 'local';
    const projectName = project?.name || '本地工程';
    
    const archive = await httpClient.uploadFirmware(
      projectId,
      projectName,
      '1.0.0',
      filePath,
      (progress) => {
        uploadProgress.value = progress;
      }
    );
    
    archives.value.unshift(archive);
    ElMessage.success('固件上传成功');
    showUploadDialog.value = false;
  } catch (error) {
    ElMessage.error('上传失败: ' + (error as Error).message);
  } finally {
    isUploading.value = false;
  }
}

async function downloadFirmware(archive: FirmwareArchive) {
  try {
    const savePath = await window.electronAPI.dialog.saveFile(archive.filePath.split('/').pop() || archive.projectName + '.bin');
    if (!savePath) return;
    
    const blob = await httpClient.downloadFirmware(archive.id, (progress) => {
      ElMessage.info(`下载进度: ${progress}%`);
    });
    
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await window.electronAPI.fs.writeFile(savePath, buffer);
    
    ElMessage.success('下载完成');
  } catch (error) {
    ElMessage.error('下载失败: ' + (error as Error).message);
  }
}

async function deleteArchive(archive: FirmwareArchive) {
  try {
    await ElMessageBox.confirm(
      `确定要删除固件 "${archive.projectName} v${archive.version}" 吗？`,
      '删除确认',
      { type: 'warning' }
    );
    
    await httpClient.deleteFirmware(archive.id);
    archives.value = archives.value.filter(a => a.id !== archive.id);
    ElMessage.success('删除成功');
  } catch {
  }
}

async function validateArchive(archive: FirmwareArchive) {
  try {
    const result = await httpClient.validateFirmware(archive.id);
    if (result.valid) {
      ElMessage.success('校验通过');
    } else {
      ElMessage.warning('校验失败，文件可能已损坏');
    }
  } catch (error) {
    ElMessage.error('校验失败: ' + (error as Error).message);
  }
}

async function viewLog(logId: string) {
  try {
    currentLogContent.value = await httpClient.getBuildLog(logId);
    showLogDetail.value = true;
  } catch (error) {
    ElMessage.error('获取日志失败');
  }
}

function getLevelClass(level: string) {
  switch (level) {
    case 'error': return 'status-error';
    case 'warning': return 'status-warning';
    case 'info': return 'status-info';
    case 'debug': return 'status-pending';
    default: return 'status-pending';
  }
}

function getLevelText(level: string) {
  switch (level) {
    case 'error': return '错误';
    case 'warning': return '警告';
    case 'info': return '信息';
    case 'debug': return '调试';
    default: return level;
  }
}

function getProjectName(projectId: string) {
  const project = projectStore.getProjectById(projectId);
  return project?.name || projectId;
}

onMounted(() => {
  if (configStore.isConnected) {
    loadArchives();
    loadLogs();
  }
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">远程服务</h1>
      <div style="display: flex; gap: 12px; align-items: center;">
        <el-tag :type="serverStatus.connected ? 'success' : 'danger'" size="large">
          {{ serverStatus.connected ? '已连接' : '未连接' }}
        </el-tag>
        <el-button
          v-if="!serverStatus.connected"
          type="success"
          @click="testConnection"
        >
          <el-icon><Connection /></el-icon>
          连接服务
        </el-button>
        <el-button
          v-else
          type="danger"
          @click="disconnect"
        >
          <el-icon><SwitchButton /></el-icon>
          断开连接
        </el-button>
      </div>
    </div>

    <el-tabs v-model="currentTab" class="tabs-container">
      <el-tab-pane label="固件归档" name="archive">
        <div v-if="!serverStatus.connected" class="empty-state">
          <el-icon :size="64" color="var(--el-text-color-secondary)"><Connection /></el-icon>
          <h3>未连接到后端服务</h3>
          <p>请先连接到后端服务以管理固件归档</p>
          <el-button type="primary" @click="testConnection">立即连接</el-button>
        </div>

        <div v-else>
          <div class="toolbar">
            <div class="toolbar-left">
              <el-input
                v-model="logFilters.projectId"
                placeholder="搜索工程..."
                clearable
                style="width: 240px;"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
            </div>
            <div class="toolbar-right">
              <el-button type="primary" @click="showUploadDialog = true">
                <el-icon><Upload /></el-icon>
                上传固件
              </el-button>
              <el-button @click="loadArchives">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
          </div>

          <div v-loading="isLoading" class="table-container">
            <el-table :data="archives" stripe>
              <el-table-column prop="projectName" label="工程名称" width="180">
                <template #default="{ row }">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <el-icon color="var(--el-color-primary)"><Cpu /></el-icon>
                    <strong>{{ row.projectName }}</strong>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="version" label="版本" width="120">
                <template #default="{ row }">
                  <code style="background: var(--el-fill-color); padding: 2px 8px; border-radius: 4px;">
                    v{{ row.version }}
                  </code>
                </template>
              </el-table-column>
              <el-table-column prop="fileSize" label="大小" width="100">
                <template #default="{ row }">
                  {{ formatFileSize(row.fileSize) }}
                </template>
              </el-table-column>
              <el-table-column prop="md5" label="MD5" width="220" show-overflow-tooltip />
              <el-table-column prop="uploadTime" label="上传时间" width="170">
                <template #default="{ row }">
                  {{ formatDate(row.uploadTime) }}
                </template>
              </el-table-column>
              <el-table-column prop="uploader" label="上传者" width="100" />
              <el-table-column label="标签" width="120">
                <template #default="{ row }">
                  <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <el-tag
                      v-for="tag in row.tags.slice(0, 2)" :key="tag" size="small" type="info">
                      {{ tag }}
                    </el-tag>
                    <el-tag v-if="row.tags.length > 2" size="small">+{{ row.tags.length - 2 }}</el-tag>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="200" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" text type="primary" @click="downloadFirmware(row)">
                    <el-icon><Download /></el-icon>
                    下载
                  </el-button>
                  <el-button size="small" text type="success" @click="validateArchive(row)">
                    <el-icon><CircleCheck /></el-icon>
                    校验
                  </el-button>
                  <el-button size="small" text type="danger" @click="deleteArchive(row)">
                    <el-icon><Delete /></el-icon>
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div v-if="archives.length === 0 && !isLoading" class="empty-state">
            <el-icon><Folder /></el-icon>
            <p class="empty-state-text">暂无固件归档</p>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="编译日志" name="logs">
        <div v-if="!serverStatus.connected" class="empty-state">
          <el-icon :size="64" color="var(--el-text-color-secondary)"><Connection /></el-icon>
          <h3>未连接到后端服务</h3>
          <p>请先连接到后端服务以查看编译日志</p>
        </div>

        <div v-else>
          <div class="toolbar">
            <div class="toolbar-left">
              <el-select v-model="logFilters.level" placeholder="日志级别" clearable style="width: 140px;">
                <el-option label="全部" value="" />
                <el-option label="错误" value="error" />
                <el-option label="警告" value="warning" />
                <el-option label="信息" value="info" />
                <el-option label="调试" value="debug" />
              </el-select>
              <el-select v-model="logFilters.projectId" placeholder="选择工程" clearable style="width: 180px;">
                <el-option
                  v-for="project in projectStore.projects"
                  :key="project.id"
                  :label="project.name"
                  :value="project.id"
                />
              </el-select>
            </div>
            <div class="toolbar-right">
              <el-button @click="loadLogs">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
          </div>

          <div v-loading="isLoading" class="table-container">
            <el-table :data="filteredLogs" stripe>
              <el-table-column prop="timestamp" label="时间" width="170">
                <template #default="{ row }">
                  {{ formatDate(row.timestamp) }}
                </template>
              </el-table-column>
              <el-table-column prop="level" label="级别" width="80">
                <template #default="{ row }">
                  <span :class="['status-tag', getLevelClass(row.level)]">
                    {{ getLevelText(row.level) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="source" label="来源" width="120" />
              <el-table-column prop="projectId" label="工程" width="150">
                <template #default="{ row }">
                  {{ getProjectName(row.projectId || '') }}
                </template>
              </el-table-column>
              <el-table-column prop="message" label="消息" min-width="300" show-overflow-tooltip />
              <el-table-column label="操作" width="100">
                <template #default="{ row }">
                  <el-button
                    v-if="row.buildId"
                    size="small"
                    text
                    type="primary"
                    @click="viewLog(row.buildId!)"
                  >
                    查看详情
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div v-if="logs.length === 0 && !isLoading" class="empty-state">
            <el-icon><Document /></el-icon>
            <p class="empty-state-text">暂无日志记录</p>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="服务状态" name="server">
        <div class="server-status">
          <div class="status-card">
            <el-icon :size="32" :color="serverStatus.connected ? '#67c23a' : '#f56c6c'">
              <component :is="serverStatus.connected ? 'CircleCheck' : 'CircleClose'" />
            </el-icon>
            <div>
              <h3>服务状态</h3>
              <p :class="serverStatus.connected ? 'text-success' : 'text-danger'">
                {{ serverStatus.connected ? '服务运行正常' : '服务未连接' }}
              </p>
            </div>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <span class="label">服务地址</span>
              <span class="value">{{ serverStatus.url }}</span>
            </div>
            <div class="info-item">
              <span class="label">主机</span>
              <span class="value">{{ serverStatus.host }}:{{ serverStatus.port }}</span>
            </div>
            <div class="info-item">
              <span class="label">固件数量</span>
              <span class="value">{{ archives.length }} 个</span>
            </div>
            <div class="info-item">
              <span class="label">日志数量</span>
              <span class="value">{{ logs.length }} 条</span>
            </div>
          </div>

          <div class="action-buttons">
            <el-button type="primary" @click="testConnection" :loading="isLoading">
              <el-icon><Refresh /></el-icon>
              重新连接
            </el-button>
            <el-button @click="loadArchives">
              <el-icon><RefreshRight /></el-icon>
              同步数据
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="showUploadDialog"
      title="上传固件"
      width="500px"
    >
      <el-upload
        class="upload-area"
        drag
        :auto-upload="false"
        :show-file-list="false"
        @change="uploadFirmware"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">
          将固件文件拖到此处，或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            支持 bin、hex、elf、axf 格式，单个文件不超过 100MB
          </div>
        </template>
      </el-upload>

      <div v-if="isUploading" class="upload-progress">
        <el-progress :percentage="uploadProgress" :status="uploadProgress === 100 ? 'success' : undefined" />
      </div>

      <template #footer>
        <div class="form-actions">
          <el-button @click="showUploadDialog = false">取消</el-button>
          <el-button type="primary" @click="uploadFirmware" :loading="isUploading">
            上传
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showLogDetail"
      title="日志详情"
      width="800px"
      class="log-detail-dialog"
    >
      <div class="log-content">
        <pre>{{ currentLogContent }}</pre>
      </div>
      <template #footer>
        <div class="form-actions">
          <el-button @click="showLogDetail = false">关闭</el-button>
          <el-button type="primary">
            <el-icon><Download /></el-icon>
            导出日志
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.server-status {
  max-width: 800px;
  margin: 0 auto;
}

.status-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 32px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  margin-bottom: 24px;
}

.status-header h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
}

.status-header p {
  margin: 0;
}

.text-success {
  color: var(--el-color-success);
}

.text-danger {
  color: var(--el-color-danger);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.info-item .label {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.info-item .value {
  font-weight: 600;
  font-family: monospace;
}

.action-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.upload-area {
  margin-bottom: 20px 0;
}

.upload-progress {
  margin-top: 20px 0;
}

.log-detail-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.log-content {
  max-height: 500px;
  overflow-y: auto;
  padding: 20px;
  background: #1e1e2e;
  color: #cdd6f4;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
