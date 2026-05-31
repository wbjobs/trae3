<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useConfigStore } from '@/stores/configStore';
import { ElMessage } from 'element-plus';
import type { CompilerConfig } from '@shared/types';

const configStore = useConfigStore();
const activeTab = ref<'general' | 'compiler' | 'server' | 'about'>('general');
const isDetecting = ref(false);
const showAddCompiler = ref(false);

const serverForm = ref({
  host: 'localhost',
  port: 3000,
  apiKey: '',
  useSsl: false
});

const newCompiler = ref<CompilerConfig>({
  type: 'gcc-arm',
  path: '',
  args: [],
  buildCommand: '',
  cleanCommand: '',
  outputPattern: ''
});

const compilerTypes = [
  { value: 'gcc-arm', label: 'GCC ARM', defaultCmd: 'make', defaultPattern: '\\.(elf|bin|hex)$' },
  { value: 'xtensa', label: 'Xtensa ESP32', defaultCmd: 'idf.py build', defaultPattern: '\\.(bin|elf)$' },
  { value: 'keil', label: 'Keil MDK', defaultCmd: 'UV4 -b', defaultPattern: '\\.(axf|hex|bin)$' },
  { value: 'iar', label: 'IAR', defaultCmd: 'iarbuild', defaultPattern: '\\.(out|hex|bin)$' },
  { value: 'custom', label: '自定义', defaultCmd: '', defaultPattern: '.*' }
];

const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'auto', label: '跟随系统' }
];

const detectedCompilers = computed(() => configStore.detectedCompilers);
const configuredCompilers = computed(() => configStore.config.compilers);

async function loadSettings() {
  serverForm.value = { ...configStore.config.server };
}

async function saveServerSettings() {
  configStore.updateServerConfig(serverForm.value);
  ElMessage.success('服务设置已保存');
}

async function detectCompilers() {
  isDetecting.value = true;
  try {
    const compilers = await configStore.detectCompilers();
    if (compilers.length > 0) {
      ElMessage.success(`检测到 ${compilers.length} 个编译器`);
    } else {
      ElMessage.info('未检测到编译器，请手动添加');
    }
  } catch (error) {
    ElMessage.error('编译器检测失败');
  } finally {
    isDetecting.value = false;
  }
}

function openAddCompiler() {
  newCompiler.value = {
    type: 'gcc-arm',
    path: '',
    args: [],
    buildCommand: 'make',
    cleanCommand: 'make clean',
    outputPattern: '\\.(elf|bin|hex)$'
  };
  showAddCompiler.value = true;
}

function onCompilerTypeChange(type: CompilerConfig['type']) {
  const compiler = compilerTypes.find(c => c.value === type);
  if (compiler) {
    newCompiler.value.buildCommand = compiler.defaultCmd;
    newCompiler.value.outputPattern = compiler.defaultPattern;
  }
}

async function selectCompilerPath() {
  const files = await window.electronAPI.dialog.openFile([
    { name: '可执行文件', extensions: ['exe', 'bat', 'sh', 'cmd'] }
  ]);
  if (files && files.length > 0) {
    newCompiler.value.path = files[0];
  }
}

async function addCompiler() {
  if (!newCompiler.value.buildCommand) {
    ElMessage.warning('请填写编译命令');
    return;
  }
  
  configStore.addCompiler({ ...newCompiler.value });
  ElMessage.success('编译器添加成功');
  showAddCompiler.value = false;
}

function removeCompiler(index: number) {
  configStore.removeCompiler(index);
  ElMessage.success('编译器已删除');
}

function changeTheme(theme: 'light' | 'dark' | 'auto') {
  configStore.setTheme(theme);
  ElMessage.success(`已切换到${themeOptions.find(t => t.value === theme)?.label}主题`);
}

async function openPath(pathType: 'projects' | 'output' | 'log' | 'temp') {
  const paths: Record<string, string> = {
    projects: configStore.config.projectsPath,
    output: configStore.config.outputPath,
    log: configStore.config.logPath,
    temp: configStore.config.tempPath
  };
  
  const path = paths[pathType];
  if (path) {
    await window.electronAPI.shell.openPath(path);
  }
}

async function selectPath(pathType: 'projects' | 'output' | 'log' | 'temp') {
  const path = await window.electronAPI.dialog.openDirectory();
  if (path) {
    switch (pathType) {
      case 'projects':
        configStore.config.projectsPath = path;
        break;
      case 'output':
        configStore.config.outputPath = path;
        break;
      case 'log':
        configStore.config.logPath = path;
        break;
      case 'temp':
        configStore.config.tempPath = path;
        break;
    }
    await configStore.saveConfig();
    ElMessage.success('路径已更新');
  }
}

async function testConnection() {
  try {
    configStore.updateServerConfig(serverForm.value);
    const health = await (await import('@/api/httpClient')).httpClient.healthCheck();
    configStore.setConnected(true);
    ElMessage.success(`连接成功! 服务版本: ${health.version}`);
  } catch (error) {
    configStore.setConnected(false);
    ElMessage.error('连接失败: ' + (error as Error).message);
  }
}

function getCompilerLabel(type: string) {
  return compilerTypes.find(c => c.value === type)?.label || type;
}

onMounted(() => {
  loadSettings();
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">系统设置</h1>
    </div>

    <div class="settings-container">
      <aside class="settings-sidebar">
        <div
          v-for="tab in [
            { key: 'general', label: '通用设置', icon: 'Setting' },
            { key: 'compiler', label: '编译器', icon: 'Tools' },
            { key: 'server', label: '服务配置', icon: 'Connection' },
            { key: 'about', label: '关于', icon: 'InfoFilled' }
          ]"
          :key="tab.key"
          class="sidebar-item"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key as any"
        >
          <el-icon :size="18">
            <component :is="tab.icon" />
          </el-icon>
          <span>{{ tab.label }}</span>
        </div>
      </aside>

      <main class="settings-content">
        <div v-show="activeTab === 'general'" class="settings-panel">
          <h2 class="panel-title">通用设置</h2>
          
          <div class="setting-section">
            <h3 class="section-title">外观</h3>
            <div class="setting-item">
              <div class="setting-info">
                <label>主题模式</label>
                <p class="description">选择应用的显示主题</p>
              </div>
              <el-radio-group :model-value="configStore.config.theme" @change="changeTheme">
                <el-radio-button
                  v-for="option in themeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </el-radio-button>
              </el-radio-group>
            </div>
          </div>

          <div class="setting-section">
            <h3 class="section-title">存储路径</h3>
            
            <div class="setting-item">
              <div class="setting-info">
                <label>工程存储目录</label>
                <p class="description">{{ configStore.config.projectsPath || '未设置' }}</p>
              </div>
              <div class="setting-actions">
                <el-button size="small" @click="openPath('projects')">
                  <el-icon><FolderOpened /></el-icon>
                  打开
                </el-button>
                <el-button size="small" type="primary" @click="selectPath('projects')">
                  <el-icon><Edit /></el-icon>
                  修改
                </el-button>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <label>编译输出目录</label>
                <p class="description">{{ configStore.config.outputPath || '未设置' }}</p>
              </div>
              <div class="setting-actions">
                <el-button size="small" @click="openPath('output')">
                  <el-icon><FolderOpened /></el-icon>
                  打开
                </el-button>
                <el-button size="small" type="primary" @click="selectPath('output')">
                  <el-icon><Edit /></el-icon>
                  修改
                </el-button>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <label>日志存储目录</label>
                <p class="description">{{ configStore.config.logPath || '未设置' }}</p>
              </div>
              <div class="setting-actions">
                <el-button size="small" @click="openPath('log')">
                  <el-icon><FolderOpened /></el-icon>
                  打开
                </el-button>
                <el-button size="small" type="primary" @click="selectPath('log')">
                  <el-icon><Edit /></el-icon>
                  修改
                </el-button>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <label>临时文件目录</label>
                <p class="description">{{ configStore.config.tempPath || '未设置' }}</p>
              </div>
              <div class="setting-actions">
                <el-button size="small" @click="openPath('temp')">
                  <el-icon><FolderOpened /></el-icon>
                  打开
                </el-button>
                <el-button size="small" type="primary" @click="selectPath('temp')">
                  <el-icon><Edit /></el-icon>
                  修改
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'compiler'" class="settings-panel">
          <div class="panel-header">
            <h2 class="panel-title">编译器配置</h2>
            <div style="display: flex; gap: 12px;">
              <el-button :loading="isDetecting" @click="detectCompilers">
                <el-icon><Search /></el-icon>
                自动检测
              </el-button>
              <el-button type="primary" @click="openAddCompiler">
                <el-icon><Plus /></el-icon>
                添加编译器
              </el-button>
            </div>
          </div>

          <div v-if="detectedCompilers.length > 0" class="setting-section">
            <h3 class="section-title">检测到的编译器</h3>
            <div class="compiler-list">
              <div
                v-for="(compiler, index) in detectedCompilers"
                :key="'detected-' + index"
                class="compiler-card"
              >
                <div class="compiler-icon">
                  <el-icon color="#67c23a" :size="24"><CircleCheck /></el-icon>
                </div>
                <div class="compiler-info">
                  <div class="compiler-name">
                    <el-tag size="small" type="success">{{ getCompilerLabel(compiler.type) }}</el-tag>
                  </div>
                  <div class="compiler-path">{{ compiler.path }}</div>
                </div>
                <el-button
                  size="small"
                  type="primary"
                  @click="configStore.addCompiler({ ...compiler })"
                >
                  添加
                </el-button>
              </div>
            </div>
          </div>

          <div class="setting-section">
            <h3 class="section-title">已配置的编译器 ({{ configuredCompilers.length }})</h3>
            
            <div v-if="configuredCompilers.length === 0" class="empty-state small">
              <el-icon><Tools /></el-icon>
              <p>暂无编译器配置</p>
            </div>

            <div v-else class="compiler-table">
              <el-table :data="configuredCompilers" border>
                <el-table-column prop="type" label="类型" width="120">
                  <template #default="{ row }">
                    <el-tag size="small">{{ getCompilerLabel(row.type) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="path" label="路径" min-width="200" show-overflow-tooltip />
                <el-table-column prop="buildCommand" label="编译命令" min-width="150" />
                <el-table-column prop="cleanCommand" label="清理命令" width="120" />
                <el-table-column prop="outputPattern" label="输出匹配" min-width="150" />
                <el-table-column label="操作" width="100" fixed="right">
                  <template #default="{ $index }">
                    <el-button
                      size="small"
                      text
                      type="danger"
                      @click="removeCompiler($index)"
                    >
                      删除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'server'" class="settings-panel">
          <h2 class="panel-title">后端服务配置</h2>
          
          <div class="setting-section">
            <el-form :model="serverForm" label-width="100px">
              <el-form-item label="服务地址">
                <el-input v-model="serverForm.host" placeholder="localhost 或 IP 地址" />
              </el-form-item>
              
              <el-form-item label="端口号">
                <el-input-number v-model="serverForm.port" :min="1" :max="65535" style="width: 100%;" />
              </el-form-item>
              
              <el-form-item label="API 密钥">
                <el-input v-model="serverForm.apiKey" type="password" placeholder="可选，用于服务认证" show-password />
              </el-form-item>
              
              <el-form-item label="启用 SSL">
                <el-switch v-model="serverForm.useSsl" />
              </el-form-item>
            </el-form>
            
            <div class="form-actions">
              <el-button @click="testConnection">
                <el-icon><Connection /></el-icon>
                测试连接
              </el-button>
              <el-button type="primary" @click="saveServerSettings">
                <el-icon><Check /></el-icon>
                保存设置
              </el-button>
            </div>
          </div>

          <div v-if="configStore.isConnected" class="setting-section">
            <el-alert
              title="已连接到后端服务"
              type="success"
              :closable="false"
              show-icon
            />
          </div>
        </div>

        <div v-show="activeTab === 'about'" class="settings-panel">
          <div class="about-section">
            <div class="app-logo">
              <el-icon :size="64" color="var(--el-color-primary)"><Cpu /></el-icon>
            </div>
            <h2 class="app-name">固件批量编译与版本管控系统</h2>
            <p class="app-version">版本: 1.0.0</p>
            <p class="app-description">
              工业嵌入式固件批量编译与版本管控桌面应用<br>
              支持多固件工程批量编译、版本差异对比、固件云端归档、编译日志拉取
            </p>
            
            <div class="tech-stack">
              <h3>技术栈</h3>
              <div class="tech-list">
                <el-tag size="large" type="primary">Electron</el-tag>
                <el-tag size="large" type="success">Vue 3</el-tag>
                <el-tag size="large" type="warning">TypeScript</el-tag>
                <el-tag size="large" type="danger">Node.js</el-tag>
                <el-tag size="large" type="info">Element Plus</el-tag>
              </div>
            </div>

            <div class="copyright">
              <p>© 2024 Industrial Firmware Team</p>
              <p>保留所有权利</p>
            </div>
          </div>
        </div>
      </main>
    </div>

    <el-dialog
      v-model="showAddCompiler"
      title="添加编译器"
      width="500px"
    >
      <el-form :model="newCompiler" label-width="100px">
        <el-form-item label="编译器类型">
          <el-select
            v-model="newCompiler.type"
            style="width: 100%;"
            @change="onCompilerTypeChange"
          >
            <el-option
              v-for="type in compilerTypes"
              :key="type.value"
              :label="type.label"
              :value="type.value"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="编译器路径">
          <div style="display: flex; gap: 8px;">
            <el-input v-model="newCompiler.path" placeholder="可选，自动检测" />
            <el-button @click="selectCompilerPath">浏览</el-button>
          </div>
        </el-form-item>
        
        <el-form-item label="编译命令">
          <el-input v-model="newCompiler.buildCommand" placeholder="例如: make" />
        </el-form-item>
        
        <el-form-item label="清理命令">
          <el-input v-model="newCompiler.cleanCommand" placeholder="例如: make clean" />
        </el-form-item>
        
        <el-form-item label="输出匹配">
          <el-input v-model="newCompiler.outputPattern" placeholder="正则表达式，例如: \.elf$" />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <div class="form-actions">
          <el-button @click="showAddCompiler = false">取消</el-button>
          <el-button type="primary" @click="addCompiler">添加</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.settings-container {
  display: flex;
  gap: 24px;
  height: calc(100vh - 140px);
}

.settings-sidebar {
  width: 200px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 12px;
  height: fit-content;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 4px;
  color: var(--el-text-color-regular);
}

.sidebar-item:hover {
  background: var(--el-fill-color-light);
}

.sidebar-item.active {
  background: var(--el-color-primary);
  color: white;
}

.settings-content {
  flex: 1;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 24px;
  overflow-y: auto;
}

.settings-panel {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.panel-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 24px 0;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.panel-header .panel-title {
  margin: 0;
  padding: 0;
  border: none;
}

.setting-section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin: 0 0 16px 0;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-info {
  flex: 1;
}

.setting-info label {
  display: block;
  font-weight: 500;
  margin-bottom: 4px;
}

.setting-info .description {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.setting-actions {
  display: flex;
  gap: 8px;
}

.compiler-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.compiler-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.compiler-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-success-light-9);
  border-radius: 8px;
}

.compiler-info {
  flex: 1;
}

.compiler-name {
  font-weight: 500;
  margin-bottom: 4px;
}

.compiler-path {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.compiler-table {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.about-section {
  text-align: center;
  padding: 40px;
}

.app-logo {
  margin-bottom: 24px;
}

.app-name {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 8px 0;
}

.app-version {
  color: var(--el-text-color-secondary);
  margin: 0 0 24px 0;
}

.app-description {
  color: var(--el-text-color-regular);
  line-height: 1.8;
  margin-bottom: 32px;
}

.tech-stack {
  margin-bottom: 32px;
}

.tech-stack h3 {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 16px;
}

.tech-list {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.copyright {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.copyright p {
  margin: 4px 0;
}

.empty-state.small {
  padding: 40px 20px;
}

.empty-state.small .el-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-state.small p {
  font-size: 14px;
}
</style>
