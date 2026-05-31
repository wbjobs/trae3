<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useProjectStore } from '@/stores/projectStore';
import { useConfigStore } from '@/stores/configStore';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FirmwareProject, BuildRecord, BuildTask, BuildOptions } from '@shared/types';
import { httpClient } from '@/api/httpClient';
import { formatDuration, formatFileSize, generateId } from '@shared/utils';

const projectStore = useProjectStore();
const configStore = useConfigStore();

const selectedProjects = ref<string[]>([]);
const currentTab = ref<'build' | 'history'>('build');
const isBuilding = ref(false);
const showOptions = ref(false);
const logs = ref<Record<string, string[]>>({});
const activeLogProject = ref<string | null>(null);
const currentTask = ref<BuildTask | null>(null);
const buildProgress = ref<Record<string, number>>({});
const retryCount = ref<Record<string, number>>({});
const maxRetryCount = ref(2);
const showRiskCheck = ref(false);
const riskResults = ref<any[]>([]);
const isCheckingRisk = ref(false);

const buildOptions = ref<BuildOptions>({
  cleanBuild: true,
  parallel: true,
  parallelCount: 4,
  uploadAfterBuild: false,
  generateVersionInfo: true
});

interface PriorityItem {
  projectId: string;
  priority: number;
  dependencies: string[];
}

const buildQueue = ref<PriorityItem[]>([]);
const completedSet = ref<Set<string>>(new Set());
const failedSet = ref<Set<string>>(new Set());
const isPaused = ref(false);

const toggleProject = (projectId: string) => {
  const index = selectedProjects.value.indexOf(projectId);
  if (index > -1) {
    selectedProjects.value.splice(index, 1);
  } else {
    selectedProjects.value.push(projectId);
  }
};

const selectAll = () => {
  if (selectedProjects.value.length === projectStore.projects.length) {
    selectedProjects.value = [];
  } else {
    selectedProjects.value = projectStore.projects.map(p => p.id);
  }
};

const selectedProjectsList = computed(() => {
  return projectStore.projects.filter(p => selectedProjects.value.includes(p.id));
});

const canBuild = computed(() => {
  return selectedProjects.value.length > 0 && !isBuilding.value;
});

const overallProgress = computed(() => {
  if (selectedProjects.value.length === 0) return 0;
  const values = Object.values(buildProgress.value);
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / selectedProjects.value.length);
});

const successCount = computed(() => {
  if (!currentTask.value) return 0;
  return Object.values(currentTask.value.buildRecords).filter(r => r.status === 'success').length;
});

const failedCount = computed(() => {
  if (!currentTask.value) return 0;
  return Object.values(currentTask.value.buildRecords).filter(r => r.status === 'failed').length;
});

const pendingCount = computed(() => {
  if (!currentTask.value) return 0;
  return Object.values(currentTask.value.buildRecords).filter(r => r.status === 'pending' || r.status === 'building').length;
});

const buildHistory = computed(() => {
  return projectStore.buildHistory.slice(0, 50);
});

function buildPriorityQueue(projectIds: string[]): PriorityItem[] {
  const queue: PriorityItem[] = [];
  const lastBuildStatus = new Map<string, string>();

  for (const projectId of projectIds) {
    const project = projectStore.getProjectById(projectId);
    if (!project) continue;

    let priority = 5;
    const lastBuild = project.lastBuild;
    
    if (lastBuild) {
      lastBuildStatus.set(projectId, lastBuild.status);
      if (lastBuild.status === 'failed') {
        priority = 8;
      } else if (lastBuild.status === 'success') {
        priority = 3;
      }
    } else {
      priority = 7;
    }

    if (project.type === 'stm32') priority += 1;
    if (project.type === 'esp32') priority += 0.5;

    queue.push({
      projectId,
      priority: Math.round(priority * 10) / 10,
      dependencies: []
    });
  }

  queue.sort((a, b) => b.priority - a.priority);
  return queue;
}

async function startBuild() {
  if (selectedProjects.value.length === 0) {
    ElMessage.warning('请至少选择一个工程');
    return;
  }

  isBuilding.value = true;
  isPaused.value = false;
  buildProgress.value = {};
  logs.value = {};
  retryCount.value = {};
  completedSet.value = new Set();
  failedSet.value = new Set();
  
  const buildRecords: Record<string, BuildRecord> = {};
  for (const projectId of selectedProjects.value) {
    const project = projectStore.getProjectById(projectId);
    if (project) {
      buildRecords[projectId] = {
        id: generateId(),
        projectId,
        version: project.version,
        status: 'pending',
        startTime: Date.now(),
        outputFiles: []
      };
      buildProgress.value[projectId] = 0;
      logs.value[projectId] = [];
      retryCount.value[projectId] = 0;
    }
  }

  currentTask.value = projectStore.addBuildTask({
    projectIds: [...selectedProjects.value],
    status: 'running',
    startTime: Date.now(),
    buildRecords,
    options: { ...buildOptions.value }
  });

  buildQueue.value = buildPriorityQueue(selectedProjects.value);
  activeLogProject.value = selectedProjects.value[0];

  addLog('system', `编译任务已启动: ${selectedProjects.value.length} 个工程`);
  addLog('system', `调度模式: ${buildOptions.value.parallel ? '并行' : '串行'}${buildOptions.value.parallel ? ` (并发数: ${buildOptions.value.parallelCount})` : ''}`);
  addLog('system', `最大重试次数: ${maxRetryCount.value}`);
  addLog('system', `优先级队列: ${buildQueue.value.map(q => {
    const p = projectStore.getProjectById(q.projectId);
    return `${p?.name}(P${q.priority})`;
  }).join(' → ')}`);

  if (buildOptions.value.parallel) {
    await buildParallelScheduler();
  } else {
    await buildSequentialScheduler();
  }

  if (currentTask.value) {
    currentTask.value.status = successCount.value > 0 && failedCount.value === 0 ? 'completed' : 'failed';
    currentTask.value.endTime = Date.now();
    projectStore.updateBuildTask(currentTask.value.id, currentTask.value);
  }

  isBuilding.value = false;
  
  addLog('system', `\n编译任务结束: 成功 ${successCount.value}, 失败 ${failedCount.value}, 总计 ${selectedProjects.value.length}`);
  
  if (failedCount.value === 0) {
    ElMessage.success(`全部编译完成，成功 ${successCount.value} 个`);
  } else {
    ElMessage.warning(`编译完成，成功 ${successCount.value} 个，失败 ${failedCount.value} 个`);
  }
}

async function buildSequentialScheduler() {
  for (const item of buildQueue.value) {
    while (isPaused.value) {
      await sleep(200);
    }
    
    await buildProjectWithRetry(item.projectId);
  }
}

async function buildParallelScheduler() {
  const concurrency = buildOptions.value.parallelCount;
  const queue = [...buildQueue.value];
  const active: Set<Promise<void>> = new Set();

  async function scheduleNext(): Promise<void> {
    while (queue.length > 0) {
      while (isPaused.value) {
        await sleep(200);
      }

      const item = queue.shift();
      if (!item) break;

      if (item.dependencies.length > 0) {
        const allDepsComplete = item.dependencies.every(dep => 
          completedSet.value.has(dep) || failedSet.value.has(dep)
        );
        
        if (!allDepsComplete) {
          queue.push(item);
          await sleep(500);
          continue;
        }

        const anyDepFailed = item.dependencies.some(dep => failedSet.value.has(dep));
        if (anyDepFailed) {
          addLog(item.projectId, '⚠ 依赖项编译失败，跳过此工程', 'warning');
          const record = currentTask.value?.buildRecords[item.projectId];
          if (record) {
            record.status = 'skipped';
            record.error = '依赖项编译失败';
            record.endTime = Date.now();
            buildProgress.value[item.projectId] = 100;
            failedSet.value.add(item.projectId);
          }
          continue;
        }
      }

      const promise = buildProjectWithRetry(item.projectId).then(() => {
        active.delete(promise);
      });
      active.add(promise);

      if (active.size >= concurrency) {
        await Promise.race(active);
      }
    }

    if (active.size > 0) {
      await Promise.all(active);
    }
  }

  await scheduleNext();
}

async function buildProjectWithRetry(projectId: string): Promise<void> {
  await buildProject(projectId);

  const record = currentTask.value?.buildRecords[projectId];
  if (record?.status === 'failed' && (retryCount.value[projectId] || 0) < maxRetryCount.value) {
    retryCount.value[projectId] = (retryCount.value[projectId] || 0) + 1;
    addLog(projectId, `\n⟳ 第 ${retryCount.value[projectId]} 次重试 (${maxRetryCount.value} 次上限)...`, 'warning');
    
    await sleep(1000);
    
    record.status = 'pending';
    record.error = undefined;
    record.endTime = undefined;
    buildProgress.value[projectId] = 0;
    
    await buildProject(projectId);
  }

  if (record?.status === 'success') {
    completedSet.value.add(projectId);
  } else if (record?.status === 'failed') {
    failedSet.value.add(projectId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function buildProject(projectId: string) {
  const project = projectStore.getProjectById(projectId);
  if (!project || !currentTask.value) return;

  const record = currentTask.value.buildRecords[projectId];
  if (!record) return;

  record.status = 'building';
  record.startTime = Date.now();
  buildProgress.value[projectId] = 5;

  try {
    const retryInfo = retryCount.value[projectId] > 0 
      ? ` (重试 ${retryCount.value[projectId]}/${maxRetryCount.value})` 
      : '';
    addLog(projectId, `\n[${new Date().toLocaleTimeString()}] 开始编译: ${project.name} (${project.version})${retryInfo}`);
    addLog(projectId, `编译器: ${project.compiler.type}`);
    addLog(projectId, `命令: ${project.compiler.buildCommand}`);
    
    const customEnv = buildOptions.value.customEnv ? { ...buildOptions.value.customEnv } : undefined;
    
    const { buildId } = await window.electronAPI.build.start(
      project,
      {
        cleanBuild: buildOptions.value.cleanBuild,
        customEnv
      }
    );

    const unsubLog = window.electronAPI.build.onLog(buildId, (log) => {
      addLog(projectId, log);
      if (buildProgress.value[projectId] < 90) {
        buildProgress.value[projectId] = Math.min(90, (buildProgress.value[projectId] || 5) + 2);
      }
    });

    await new Promise<void>((resolve) => {
      const unsubComplete = window.electronAPI.build.onComplete(buildId, (result) => {
        Object.assign(record, result);
        buildProgress.value[projectId] = result.status === 'success' ? 100 : 100;
        
        if (result.status === 'success') {
          addLog(projectId, `\n✓ 编译成功!`, 'success');
          addLog(projectId, `  输出文件: ${result.outputFiles.join(', ')}`);
          addLog(projectId, `  MD5: ${result.md5}`);
          addLog(projectId, `  大小: ${formatFileSize(result.size)}`);
          addLog(projectId, `  耗时: ${formatDuration((result.endTime || Date.now()) - result.startTime)}`);
          
          projectStore.addBuildRecord(result);
          
          if (buildOptions.value.uploadAfterBuild && result.outputPath && configStore.isConnected) {
            uploadFirmware(project, result);
          }
        } else {
          addLog(projectId, `\n✗ 编译失败: ${result.error}`, 'error');
        }
        
        unsubLog();
        unsubComplete();
        
        setTimeout(resolve, 100);
      });
    });

  } catch (error) {
    record.status = 'failed';
    record.error = error instanceof Error ? error.message : String(error);
    record.endTime = Date.now();
    buildProgress.value[projectId] = 100;
    addLog(projectId, `\n✗ 编译异常: ${record.error}`, 'error');
  }
}

async function uploadFirmware(project: FirmwareProject, record: BuildRecord) {
  if (!record.outputPath) return;
  
  try {
    addLog(record.projectId, '\n正在上传到云端...', 'info');
    
    await httpClient.uploadFirmware(
      project.id,
      project.name,
      record.version,
      record.outputPath,
      (progress) => {
        addLog(record.projectId, `上传进度: ${progress}%`);
      }
    );
    
    addLog(record.projectId, '✓ 固件已上传到云端归档', 'success');
  } catch (error) {
    addLog(record.projectId, `✗ 上传失败: ${(error as Error).message}`, 'error');
  }
}

function addLog(projectId: string, message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  if (!logs.value[projectId]) {
    logs.value[projectId] = [];
  }
  
  const timestamp = new Date().toLocaleTimeString();
  const formatted = `[${timestamp}] ${message}`;
  
  logs.value[projectId].push(formatted);
  
  if (logs.value[projectId].length > 1000) {
    logs.value[projectId] = logs.value[projectId].slice(-1000);
  }

  nextTick(() => {
    const logContainer = document.querySelector('.log-content');
    if (logContainer && activeLogProject.value === projectId) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  });
}

function stopBuild() {
  ElMessageBox.confirm(
    '确定要停止当前编译任务吗？已完成的编译将保留。',
    '停止编译',
    { type: 'warning' }
  ).then(() => {
    if (currentTask.value) {
      for (const projectId of currentTask.value.projectIds) {
        const record = currentTask.value.buildRecords[projectId];
        if (record.status === 'building') {
          window.electronAPI.build.cancel(record.id);
          record.status = 'failed';
          record.error = '用户取消';
          addLog(projectId, '✗ 用户取消编译', 'warning');
        }
      }
      currentTask.value.status = 'failed';
      currentTask.value.endTime = Date.now();
      projectStore.updateBuildTask(currentTask.value.id, currentTask.value);
    }
    isBuilding.value = false;
    isPaused.value = false;
    ElMessage.info('编译已停止');
  }).catch(() => {});
}

function togglePause() {
  isPaused.value = !isPaused.value;
  addLog('system', isPaused.value ? '⏸ 编译任务已暂停' : '▶ 编译任务已恢复', 'warning');
  ElMessage.info(isPaused.value ? '编译已暂停' : '编译已恢复');
}

function retryFailed() {
  if (!currentTask.value) return;
  
  const failedProjectIds = Object.entries(currentTask.value.buildRecords)
    .filter(([_, r]) => r.status === 'failed')
    .map(([id]) => id);
  
  if (failedProjectIds.length === 0) {
    ElMessage.info('没有失败的任务需要重试');
    return;
  }

  for (const projectId of failedProjectIds) {
    const record = currentTask.value.buildRecords[projectId];
    record.status = 'pending';
    record.error = undefined;
    record.endTime = undefined;
    retryCount.value[projectId] = 0;
    buildProgress.value[projectId] = 0;
    addLog(projectId, '⟳ 任务已重置，准备重试', 'info');
  }

  ElMessage.info(`已重置 ${failedProjectIds.length} 个失败任务`);
}

function showBuildLog(projectId: string) {
  activeLogProject.value = projectId;
}

function clearLogs() {
  logs.value = {};
  activeLogProject.value = null;
}

function getStatusClass(status: string) {
  switch (status) {
    case 'success': return 'status-success';
    case 'failed': return 'status-error';
    case 'building': return 'status-building';
    case 'pending': return 'status-pending';
    case 'skipped': return 'status-warning';
    default: return 'status-pending';
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'success': return '成功';
    case 'failed': return '失败';
    case 'building': return '编译中';
    case 'pending': return '等待中';
    case 'skipped': return '已跳过';
    default: return status;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success': return 'CircleCheck';
    case 'failed': return 'CircleClose';
    case 'building': return 'Loading';
    case 'pending': return 'Clock';
    case 'skipped': return 'Warning';
    default: return 'QuestionFilled';
  }
}

function exportLog(projectId: string) {
  const projectLogs = logs.value[projectId] || [];
  const content = projectLogs.join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `build_log_${projectId}_${Date.now()}.log`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success('日志已导出');
}

function getRetryLabel(projectId: string): string {
  const count = retryCount.value[projectId] || 0;
  return count > 0 ? `R${count}` : '';
}

async function runRiskCheck() {
  if (selectedProjects.value.length === 0) {
    ElMessage.warning('请至少选择一个工程');
    return;
  }

  isCheckingRisk.value = true;
  showRiskCheck.value = true;
  
  try {
    const projects = selectedProjectsList.value;
    riskResults.value = await window.electronAPI.risk.preCheck(projects);
    
    const criticalCount = riskResults.value.filter(r => r.overallRisk === 'critical').length;
    const highCount = riskResults.value.filter(r => r.overallRisk === 'high').length;
    
    if (criticalCount > 0) {
      ElMessage.error(`${criticalCount} 个工程存在严重风险，无法编译`);
    } else if (highCount > 0) {
      ElMessage.warning(`${highCount} 个工程存在高风险，请检查`);
    } else {
      ElMessage.success('风险检测通过，可以安全编译');
    }
  } catch (error) {
    ElMessage.error('风险检测失败: ' + (error as Error).message);
  } finally {
    isCheckingRisk.value = false;
  }
}

function getRiskLevelClass(level: string) {
  switch (level) {
    case 'critical': return 'status-error';
    case 'high': return 'status-warning';
    case 'medium': return 'status-info';
    default: return 'status-success';
  }
}

function getCheckStatusClass(status: string) {
  switch (status) {
    case 'fail': return 'status-error';
    case 'warning': return 'status-warning';
    default: return 'status-success';
  }
}

onMounted(() => {
  if (projectStore.projects.length > 0) {
    selectedProjects.value = [projectStore.projects[0].id];
  }
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">批量编译</h1>
      <div style="display: flex; gap: 12px;">
        <el-button
          v-if="!isBuilding"
          :disabled="!canBuild"
          type="primary"
          size="large"
          @click="startBuild"
        >
          <el-icon><VideoPlay /></el-icon>
          开始编译
        </el-button>
        <el-button
          v-if="isBuilding"
          type="warning"
          size="large"
          @click="togglePause"
        >
          <el-icon><component :is="isPaused ? 'VideoPlay' : 'VideoPause'" /></el-icon>
          {{ isPaused ? '恢复' : '暂停' }}
        </el-button>
        <el-button
          v-if="isBuilding"
          type="danger"
          size="large"
          @click="stopBuild"
        >
          <el-icon><CircleClose /></el-icon>
          停止
        </el-button>
        <el-button
          v-if="!isBuilding && failedCount > 0"
          type="warning"
          size="large"
          @click="retryFailed"
        >
          <el-icon><RefreshRight /></el-icon>
          重试失败
        </el-button>
        <el-button
          v-if="!isBuilding"
          type="info"
          size="large"
          @click="runRiskCheck"
        >
          <el-icon><Warning /></el-icon>
          风险预检
        </el-button>
        <el-button @click="showOptions = true">
          <el-icon><Setting /></el-icon>
          编译选项
        </el-button>
      </div>
    </div>

    <el-tabs v-model="currentTab" class="tabs-container">
      <el-tab-pane label="编译任务" name="build">
        <div v-if="projectStore.projects.length === 0" class="empty-state">
          <el-icon><Folder /></el-icon>
          <p class="empty-state-text">暂无工程，请先在工程管理中添加</p>
        </div>

        <div v-else class="build-content">
          <div class="project-list-panel">
            <div class="panel-header">
              <el-checkbox
                :model-value="selectedProjects.length === projectStore.projects.length && projectStore.projects.length > 0"
                :indeterminate="selectedProjects.length > 0 && selectedProjects.length < projectStore.projects.length"
                @change="selectAll"
              >
                全选 ({{ selectedProjects.length }}/{{ projectStore.projects.length }})
              </el-checkbox>
              <span class="badge badge-primary" v-if="isBuilding">
                {{ overallProgress }}%
              </span>
            </div>

            <div class="project-list">
              <div
                v-for="project in projectStore.projects"
                :key="project.id"
                class="project-item"
                :class="{ active: activeLogProject === project.id, selected: selectedProjects.includes(project.id) }"
                @click="toggleProject(project.id)"
              >
                <el-checkbox
                  :model-value="selectedProjects.includes(project.id)"
                  @click.stop
                />
                <div class="project-info" @click.stop="showBuildLog(project.id)">
                  <div class="project-name">{{ project.name }}</div>
                  <div class="project-meta">
                    <span class="badge badge-info">{{ project.type }}</span>
                    <span class="version">v{{ project.version }}</span>
                  </div>
                </div>
                <div class="project-status" v-if="isBuilding && currentTask">
                  <template v-if="currentTask.buildRecords[project.id]">
                    <el-icon
                      :class="getStatusClass(currentTask.buildRecords[project.id].status)"
                      :size="20"
                    >
                      <component :is="getStatusIcon(currentTask.buildRecords[project.id].status)" />
                    </el-icon>
                    <span v-if="currentTask.buildRecords[project.id].status === 'building'">
                      {{ Math.round(buildProgress[project.id] || 0) }}%
                    </span>
                  </template>
                </div>
                <div class="project-status" v-else>
                  <template v-if="project.lastBuild">
                    <span :class="['status-tag', getStatusClass(project.lastBuild.status)]">
                      {{ getStatusText(project.lastBuild.status) }}
                    </span>
                  </template>
                  <span v-else class="status-tag status-pending">未编译</span>
                </div>
              </div>
            </div>

            <div v-if="isBuilding && currentTask" class="build-summary">
              <el-progress
                :percentage="overallProgress"
                :status="overallProgress === 100 ? (failedCount > 0 ? 'exception' : 'success') : undefined"
              />
              <div class="summary-stats">
                <div class="stat">
                  <span class="stat-label">成功</span>
                  <span class="stat-value text-success">{{ successCount }}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">失败</span>
                  <span class="stat-value text-danger">{{ failedCount }}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">等待</span>
                  <span class="stat-value text-warning">{{ pendingCount }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="log-panel">
            <div class="panel-header">
              <span>编译日志</span>
              <div style="display: flex; gap: 8px;">
                <el-button
                  v-if="activeLogProject && logs[activeLogProject]?.length > 0"
                  size="small"
                  @click="exportLog(activeLogProject)"
                >
                  <el-icon><Download /></el-icon>
                  导出日志
                </el-button>
                <el-button size="small" @click="clearLogs">
                  <el-icon><Delete /></el-icon>
                  清空
                </el-button>
              </div>
            </div>

            <div v-if="!activeLogProject" class="log-empty">
              <el-icon><Document /></el-icon>
              <p>选择工程查看编译日志</p>
            </div>

            <div v-else-if="!logs[activeLogProject] || logs[activeLogProject].length === 0" class="log-empty">
              <el-icon><Loading /></el-icon>
              <p>等待编译开始...</p>
            </div>

            <div v-else class="log-content">
              <div
                v-for="(line, index) in logs[activeLogProject]"
                :key="index"
                class="log-line"
                :class="{
                  error: line.includes('✗') || line.includes('error') || line.includes('ERROR'),
                  warning: line.includes('warning') || line.includes('WARNING'),
                  success: line.includes('✓') || line.includes('成功'),
                  info: line.includes('[') && !line.includes('✗') && !line.includes('✓')
                }"
              >
                {{ line }}
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="编译历史" name="history">
        <div v-if="buildHistory.length === 0" class="empty-state">
          <el-icon><Clock /></el-icon>
          <p class="empty-state-text">暂无编译历史</p>
        </div>

        <div v-else class="table-container">
          <el-table :data="buildHistory" stripe>
            <el-table-column prop="projectId" label="工程" width="180">
              <template #default="{ row }">
                {{ projectStore.getProjectById(row.projectId)?.name || '未知工程' }}
              </template>
            </el-table-column>
            <el-table-column prop="version" label="版本" width="120">
              <template #default="{ row }">
                <code>v{{ row.version }}</code>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <span :class="['status-tag', getStatusClass(row.status)]">
                  {{ getStatusText(row.status) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="size" label="大小" width="100">
              <template #default="{ row }">
                {{ formatFileSize(row.size) }}
              </template>
            </el-table-column>
            <el-table-column prop="md5" label="MD5" width="220" show-overflow-tooltip />
            <el-table-column prop="startTime" label="开始时间" width="170">
              <template #default="{ row }">
                {{ new Date(row.startTime).toLocaleString('zh-CN') }}
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="100">
              <template #default="{ row }">
                {{ row.endTime ? formatDuration(row.endTime - row.startTime) : '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="error" label="错误信息" min-width="200" show-overflow-tooltip />
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showOptions" title="编译选项" width="500px">
      <el-form :model="buildOptions" label-width="140px">
        <el-form-item label="清理编译">
          <el-switch v-model="buildOptions.cleanBuild" />
          <span style="margin-left: 12px; color: var(--el-text-color-secondary); font-size: 13px;">
            编译前执行清理命令
          </span>
        </el-form-item>
        
        <el-form-item label="并行编译">
          <el-switch v-model="buildOptions.parallel" />
          <span style="margin-left: 12px; color: var(--el-text-color-secondary); font-size: 13px;">
            同时编译多个工程
          </span>
        </el-form-item>
        
        <el-form-item label="并行数量" v-if="buildOptions.parallel">
          <el-slider
            v-model="buildOptions.parallelCount"
            :min="2"
            :max="16"
            :step="1"
            show-input
          />
        </el-form-item>

        <el-form-item label="失败重试次数">
          <el-input-number v-model="maxRetryCount" :min="0" :max="5" :step="1" />
          <span style="margin-left: 12px; color: var(--el-text-color-secondary); font-size: 13px;">
            编译失败后自动重试
          </span>
        </el-form-item>
        
        <el-form-item label="编译后上传">
          <el-switch v-model="buildOptions.uploadAfterBuild" />
          <span style="margin-left: 12px; color: var(--el-text-color-secondary); font-size: 13px;">
            成功后自动上传到云端
          </span>
        </el-form-item>
        
        <el-form-item label="生成版本信息">
          <el-switch v-model="buildOptions.generateVersionInfo" />
          <span style="margin-left: 12px; color: var(--el-text-color-secondary); font-size: 13px;">
            生成详细版本元数据
          </span>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <div class="form-actions">
          <el-button @click="showOptions = false">取消</el-button>
          <el-button type="primary" @click="showOptions = false">确定</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="showRiskCheck" title="编译风险预检测" width="800px" class="risk-dialog">
      <div v-if="isCheckingRisk" class="risk-loading">
        <el-icon :size="32" class="loading-icon"><Loading /></el-icon>
        <p>正在检测编译风险...</p>
      </div>
      <div v-else-if="riskResults.length > 0">
        <div v-for="result in riskResults" :key="result.projectId" class="risk-project-card">
          <div class="risk-project-header">
            <span class="risk-project-name">{{ result.projectName }}</span>
            <span :class="['status-tag', getRiskLevelClass(result.overallRisk)]">
              {{ result.overallRisk === 'critical' ? '严重' : result.overallRisk === 'high' ? '高风险' : result.overallRisk === 'medium' ? '中等' : '低风险' }}
            </span>
            <span v-if="!result.canBuild" class="status-tag status-error">不可编译</span>
          </div>
          <div class="risk-checks">
            <div v-for="check in result.checks" :key="check.name" class="risk-check-item">
              <span :class="['risk-check-status', getCheckStatusClass(check.status)]">
                <el-icon :size="14">
                  <component :is="check.status === 'pass' ? 'CircleCheck' : check.status === 'fail' ? 'CircleClose' : 'Warning'" />
                </el-icon>
              </span>
              <span class="risk-check-name">{{ check.name }}</span>
              <span class="risk-check-message">{{ check.message }}</span>
              <span v-if="check.suggestion" class="risk-check-suggestion">{{ check.suggestion }}</span>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.build-content {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
  height: calc(100vh - 280px);
  min-height: 500px;
}

.project-list-panel,
.log-panel {
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-page);
}

.project-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.project-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.project-item:hover {
  background: var(--el-fill-color-light);
}

.project-item.selected {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}

.project-item.active {
  border-color: var(--el-color-primary);
}

.project-info {
  flex: 1;
  min-width: 0;
}

.project-name {
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.version {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.project-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.build-summary {
  padding: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-page);
}

.summary-stats {
  display: flex;
  justify-content: space-around;
  margin-top: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
}

.text-success {
  color: var(--el-color-success);
}

.text-danger {
  color: var(--el-color-danger);
}

.text-warning {
  color: var(--el-color-warning);
}

.log-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  gap: 12px;
}

.log-empty .el-icon {
  font-size: 48px;
  opacity: 0.3;
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #1e1e2e;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
}

.log-line {
  color: #cdd6f4;
  white-space: pre-wrap;
  word-break: break-all;
  margin-bottom: 2px;
}

.log-line.error {
  color: #f38ba8;
}

.log-line.warning {
  color: #f9e2af;
}

.log-line.success {
  color: #a6e3a1;
}

.log-line.info {
  color: #89b4fa;
}

.risk-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
}

.loading-icon {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.risk-project-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  margin-bottom: 16px;
  overflow: hidden;
}

.risk-project-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--el-bg-color-page);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.risk-project-name {
  font-weight: 600;
  font-size: 14px;
}

.risk-checks {
  padding: 8px;
}

.risk-check-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
}

.risk-check-item:hover {
  background: var(--el-fill-color-light);
}

.risk-check-status {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.risk-check-name {
  font-weight: 500;
  min-width: 80px;
  flex-shrink: 0;
}

.risk-check-message {
  flex: 1;
  color: var(--el-text-color-regular);
}

.risk-check-suggestion {
  color: var(--el-color-primary);
  font-size: 12px;
  flex-shrink: 0;
}
</style>
