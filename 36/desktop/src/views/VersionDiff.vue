<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useProjectStore } from '@/stores/projectStore';
import { useConfigStore } from '@/stores/configStore';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FirmwareArchive, DiffResult, FirmwareProject, SectionDiff, FileChange, BuildSnapshot, VersionRollbackResult } from '@shared/types';
import { httpClient } from '@/api/httpClient';
import { formatFileSize, compareVersions, compareSnapshots, compareFileContents, analyzeFirmwareSections, createBuildSnapshot } from '@shared/utils';
import * as Diff from 'diff';

const projectStore = useProjectStore();
const configStore = useConfigStore();

const sourceType = ref<'local' | 'remote'>('local');
const selectedProjectId = ref<string | null>(null);
const leftVersion = ref<string | null>(null);
const rightVersion = ref<string | null>(null);
const diffResult = ref<DiffResult | null>(null);
const isComparing = ref(false);
const localVersions = ref<Map<string, string[]>>(new Map());
const remoteArchives = ref<FirmwareArchive[]>([]);
const showFileDiff = ref(false);
const selectedFile = ref<string | null>(null);
const fileDiffContent = ref<{ left: string; right: string } | null>(null);

const projects = computed(() => projectStore.projects);

const selectedProject = computed(() => {
  return selectedProjectId.value
    ? projectStore.getProjectById(selectedProjectId.value)
    : null;
});

const leftVersions = computed(() => {
  if (sourceType.value === 'local') {
    const history = projectStore.getBuildHistory(selectedProjectId.value || '');
    return history.map(h => h.version).filter((v, i, a) => a.indexOf(v) === i).sort(compareVersions).reverse();
  } else {
    return remoteArchives.value
      .filter(a => a.projectId === selectedProjectId.value)
      .map(a => a.version)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort(compareVersions)
      .reverse();
  }
});

const rightVersions = computed(() => {
  return leftVersions.value;
});

const canCompare = computed(() => {
  return selectedProjectId.value && leftVersion.value && rightVersion.value && leftVersion.value !== rightVersion.value;
});

function selectProject(projectId: string) {
  selectedProjectId.value = projectId;
  leftVersion.value = null;
  rightVersion.value = null;
  diffResult.value = null;
  loadVersions();
}

async function loadVersions() {
  if (sourceType.value === 'remote' && configStore.isConnected) {
    try {
      const response = await httpClient.getFirmwareList({ page: 1, pageSize: 100 });
      remoteArchives.value = response.items;
    } catch (error) {
      ElMessage.error('加载远程版本失败');
    }
  }
}

async function compareFirmware() {
  if (!canCompare.value) return;

  isComparing.value = true;
  diffResult.value = null;

  try {
    if (sourceType.value === 'remote' && configStore.isConnected) {
      const leftArchive = remoteArchives.value.find(
        a => a.projectId === selectedProjectId.value && a.version === leftVersion.value
      );
      const rightArchive = remoteArchives.value.find(
        a => a.projectId === selectedProjectId.value && a.version === rightVersion.value
      );

      if (leftArchive && rightArchive) {
        diffResult.value = await httpClient.compareVersions(leftArchive.id, rightArchive.id);
      }
    } else {
      await compareLocal();
    }

    ElMessage.success('版本对比完成');
  } catch (error) {
    ElMessage.error('对比失败: ' + (error as Error).message);
  } finally {
    isComparing.value = false;
  }
}

async function compareLocal() {
  if (!selectedProject.value || !leftVersion.value || !rightVersion.value) return;

  const history = projectStore.getBuildHistory(selectedProject.value.id);
  const leftBuild = history.find(h => h.version === leftVersion.value);
  const rightBuild = history.find(h => h.version === rightVersion.value);

  if (!leftBuild || !rightBuild) {
    ElMessage.warning('未找到对应的构建记录');
    return;
  }

  let leftSnapshot = leftBuild.snapshot;
  let rightSnapshot = rightBuild.snapshot;

  if (!leftSnapshot) {
    ElMessage.info('正在为旧版本创建快照...');
    leftSnapshot = await window.electronAPI.snapshot.create(leftBuild.id, selectedProject.value.path, false);
    if (leftSnapshot && leftBuild.outputPath) {
      const sections = await window.electronAPI.firmware.analyzeSections(leftBuild.outputPath);
      if (sections) leftSnapshot.sectionSizes = sections;
    }
  }

  if (!rightSnapshot) {
    ElMessage.info('正在为新版本创建快照...');
    rightSnapshot = await window.electronAPI.snapshot.create(rightBuild.id, selectedProject.value.path, false);
    if (rightSnapshot && rightBuild.outputPath) {
      const sections = await window.electronAPI.firmware.analyzeSections(rightBuild.outputPath);
      if (sections) rightSnapshot.sectionSizes = sections;
    }
  }

  if (!leftSnapshot || !rightSnapshot) {
    ElMessage.error('无法创建构建快照，无法进行对比');
    return;
  }

  let sections: SectionDiff[];
  
  if (leftSnapshot.sectionSizes && rightSnapshot.sectionSizes) {
    sections = [
      { 
        name: '.text', 
        leftSize: leftSnapshot.sectionSizes.text, 
        rightSize: rightSnapshot.sectionSizes.text, 
        diff: rightSnapshot.sectionSizes.text - leftSnapshot.sectionSizes.text 
      },
      { 
        name: '.data', 
        leftSize: leftSnapshot.sectionSizes.data, 
        rightSize: rightSnapshot.sectionSizes.data, 
        diff: rightSnapshot.sectionSizes.data - leftSnapshot.sectionSizes.data 
      },
      { 
        name: '.bss', 
        leftSize: leftSnapshot.sectionSizes.bss, 
        rightSize: rightSnapshot.sectionSizes.bss, 
        diff: rightSnapshot.sectionSizes.bss - leftSnapshot.sectionSizes.bss 
      }
    ];
  } else {
    if (leftBuild.outputPath) {
      const leftSections = await window.electronAPI.firmware.analyzeSections(leftBuild.outputPath);
      if (leftSections) leftSnapshot.sectionSizes = leftSections;
    }
    if (rightBuild.outputPath) {
      const rightSections = await window.electronAPI.firmware.analyzeSections(rightBuild.outputPath);
      if (rightSections) rightSnapshot.sectionSizes = rightSections;
    }

    if (leftSnapshot.sectionSizes && rightSnapshot.sectionSizes) {
      sections = [
        { 
          name: '.text', 
          leftSize: leftSnapshot.sectionSizes.text, 
          rightSize: rightSnapshot.sectionSizes.text, 
          diff: rightSnapshot.sectionSizes.text - leftSnapshot.sectionSizes.text 
        },
        { 
          name: '.data', 
          leftSize: leftSnapshot.sectionSizes.data, 
          rightSize: rightSnapshot.sectionSizes.data, 
          diff: rightSnapshot.sectionSizes.data - leftSnapshot.sectionSizes.data 
        },
        { 
          name: '.bss', 
          leftSize: leftSnapshot.sectionSizes.bss, 
          rightSize: rightSnapshot.sectionSizes.bss, 
          diff: rightSnapshot.sectionSizes.bss - leftSnapshot.sectionSizes.bss 
        }
      ];
    } else {
      sections = [
        { name: '.text', leftSize: leftBuild.size || 0, rightSize: rightBuild.size || 0, diff: (rightBuild.size || 0) - (leftBuild.size || 0) },
        { name: '.data', leftSize: 0, rightSize: 0, diff: 0 },
        { name: '.bss', leftSize: 0, rightSize: 0, diff: 0 }
      ];
    }
  }

  const { changes } = compareSnapshots(leftSnapshot, rightSnapshot);

  diffResult.value = {
    leftVersion: leftVersion.value,
    rightVersion: rightVersion.value,
    sizeDiff: (rightBuild.size || 0) - (leftBuild.size || 0),
    sections,
    hashes: {
      left: leftBuild.md5 || '',
      right: rightBuild.md5 || ''
    },
    changes
  };

  if (!leftBuild.snapshot) {
    leftBuild.snapshot = leftSnapshot;
    projectStore.updateBuildRecord(selectedProject.value.id, leftBuild);
  }
  if (!rightBuild.snapshot) {
    rightBuild.snapshot = rightSnapshot;
    projectStore.updateBuildRecord(selectedProject.value.id, rightBuild);
  }
}

async function showFileDiffDetail(file: string) {
  if (!selectedProject.value || !leftVersion.value || !rightVersion.value) return;
  
  try {
    const history = projectStore.getBuildHistory(selectedProject.value.id);
    const leftBuild = history.find(h => h.version === leftVersion.value);
    const rightBuild = history.find(h => h.version === rightVersion.value);

    if (!leftBuild || !rightBuild) {
      ElMessage.warning('未找到对应的构建记录');
      return;
    }

    let leftContent: string | null = null;
    let rightContent: string | null = null;

    if (leftBuild.snapshot) {
      const leftFile = leftBuild.snapshot.files.find(f => f.path === file);
      if (leftFile?.content) {
        leftContent = leftFile.content;
      }
    }

    if (rightBuild.snapshot) {
      const rightFile = rightBuild.snapshot.files.find(f => f.path === file);
      if (rightFile?.content) {
        rightContent = rightFile.content;
      }
    }

    if (!leftContent || !rightContent) {
      const filePath = await window.electronAPI.path.join(selectedProject.value.path, file);
      const fileExists = await window.electronAPI.fs.exists(filePath);
      
      if (fileExists) {
        const currentContent = await window.electronAPI.fs.readFile(filePath, 'utf-8');
        if (!leftContent) leftContent = currentContent;
        if (!rightContent) rightContent = currentContent;
      } else {
        if (!leftContent) leftContent = '// 文件不存在\n';
        if (!rightContent) rightContent = '// 文件不存在\n';
      }
    }

    fileDiffContent.value = {
      left: leftContent,
      right: rightContent
    };
    
    selectedFile.value = file;
    showFileDiff.value = true;
  } catch (error) {
    console.error('File diff error:', error);
    ElMessage.error('无法读取文件进行对比: ' + (error as Error).message);
  }
}

function getDiffColor(diff: number) {
  if (diff > 0) return 'text-danger';
  if (diff < 0) return 'text-success';
  return 'text-info';
}

function getDiffIcon(diff: number) {
  if (diff > 0) return 'Top';
  if (diff < 0) return 'Bottom';
  return 'Minus';
}

function getChangeTypeClass(type: string) {
  switch (type) {
    case 'added': return 'status-success';
    case 'modified': return 'status-info';
    case 'deleted': return 'status-error';
    default: return 'status-pending';
  }
}

function getChangeTypeText(type: string) {
  switch (type) {
    case 'added': return '新增';
    case 'modified': return '修改';
    case 'deleted': return '删除';
    default: return type;
  }
}

async function loadRemoteArchives() {
  if (configStore.isConnected) {
    try {
      const response = await httpClient.getFirmwareList({ page: 1, pageSize: 100 });
      remoteArchives.value = response.items;
    } catch (error) {
      console.error('Failed to load archives:', error);
    }
  }
}

function swapVersions() {
  const temp = leftVersion.value;
  leftVersion.value = rightVersion.value;
  rightVersion.value = temp;
  diffResult.value = null;
}

const isRollingBack = ref(false);

async function rollbackToVersion(targetVersion: string) {
  if (!selectedProject.value) return;

  try {
    await ElMessageBox.confirm(
      `确定要将 ${selectedProject.value.name} 回滚到版本 ${targetVersion} 吗？此操作将通过云端版本归档完成回滚。`,
      '版本回滚确认',
      {
        type: 'warning',
        confirmButtonText: '确认回滚',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true
      }
    );
  } catch {
    return;
  }

  isRollingBack.value = true;
  try {
    const result = await httpClient.rollbackVersion(
      selectedProject.value.id,
      targetVersion,
      `用户手动回滚 - 从版本对比界面发起`
    );

    if (result.success) {
      ElMessage.success(result.message);
      
      if (selectedProject.value) {
        selectedProject.value.version = result.newVersion;
        projectStore.updateProject(selectedProject.value.id, selectedProject.value);
      }
    } else {
      ElMessage.error(result.message);
    }
  } catch (error) {
    ElMessage.error('版本回滚失败: ' + (error as Error).message);
  } finally {
    isRollingBack.value = false;
  }
}

const diffLines = computed(() => {
  if (!fileDiffContent.value) return [];
  
  const changes = Diff.diffLines(fileDiffContent.value.left, fileDiffContent.value.right);
  const leftLines: { content: string; type: 'unchanged' | 'added' | 'deleted'; lineNum: number }[] = [];
  const rightLines: { content: string; type: 'unchanged' | 'added' | 'deleted'; lineNum: number }[] = [];
  
  let leftLine = 1;
  let rightLine = 1;
  
  for (const change of changes) {
    if (change.added) {
      for (let i = 0; i < change.count!; i++) {
        rightLines.push({ 
          content: change.value.split('\n')[i] || '', 
          type: 'added', 
          lineNum: rightLine++ 
        });
      }
    } else if (change.removed) {
      for (let i = 0; i < change.count!; i++) {
        leftLines.push({ 
          content: change.value.split('\n')[i] || '', 
          type: 'deleted', 
          lineNum: leftLine++ 
        });
      }
    } else {
      for (let i = 0; i < change.count!; i++) {
        const lineContent = change.value.split('\n')[i] || '';
        leftLines.push({ content: lineContent, type: 'unchanged', lineNum: leftLine++ });
        rightLines.push({ content: lineContent, type: 'unchanged', lineNum: rightLine++ });
      }
    }
  }
  
  return { leftLines, rightLines };
});

const renderDiffLeft = computed(() => {
  if (!fileDiffContent.value || !diffLines.value.leftLines.length) {
    return fileDiffContent.value?.left || '';
  }
  
  return diffLines.value.leftLines.map(line => {
    const num = line.lineNum.toString().padStart(4, ' ');
    if (line.type === 'deleted') {
      return `${num} - ${line.content}`;
    }
    return `${num}   ${line.content}`;
  }).join('\n');
});

const renderDiffRight = computed(() => {
  if (!fileDiffContent.value || !diffLines.value.rightLines.length) {
    return fileDiffContent.value?.right || '';
  }
  
  return diffLines.value.rightLines.map(line => {
    const num = line.lineNum.toString().padStart(4, ' ');
    if (line.type === 'added') {
      return `${num} + ${line.content}`;
    }
    return `${num}   ${line.content}`;
  }).join('\n');
});

onMounted(() => {
  loadRemoteArchives();
  if (projectStore.projects.length > 0) {
    selectProject(projectStore.projects[0].id);
  }
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">版本对比</h1>
      <div style="display: flex; gap: 12px;">
        <el-radio-group v-model="sourceType" size="large">
          <el-radio-button value="local">本地版本</el-radio-button>
          <el-radio-button value="remote" :disabled="!configStore.isConnected">云端版本</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <div class="diff-layout">
      <div class="project-panel">
        <div class="panel-header">
          <span class="panel-title">选择工程</span>
          <span class="badge badge-info">{{ projects.length }} 个工程</span>
        </div>
        <div class="project-list">
          <div
            v-for="project in projects"
            :key="project.id"
            class="project-item"
            :class="{ active: selectedProjectId === project.id }"
            @click="selectProject(project.id)"
          >
            <el-icon :size="20" color="var(--el-color-primary)"><Cpu /></el-icon>
            <div class="project-info">
              <div class="project-name">{{ project.name }}</div>
              <div class="project-version">v{{ project.version }}</div>
            </div>
            <el-icon><ArrowRight /></el-icon>
          </div>
          
          <div v-if="projects.length === 0" class="empty-state small">
            <el-icon><Folder /></el-icon>
            <p>暂无工程</p>
          </div>
        </div>
      </div>

      <div class="diff-panel">
        <div class="panel-header">
          <span class="panel-title">版本选择</span>
          <el-button
            :disabled="!canCompare"
            type="primary"
            :loading="isComparing"
            @click="compareFirmware"
          >
            <el-icon><Comparison /></el-icon>
            开始对比
          </el-button>
        </div>

        <div class="version-selector">
          <div class="version-column">
            <label class="version-label">基准版本</label>
            <el-select
              v-model="leftVersion"
              placeholder="选择旧版本"
              style="width: 100%;"
              size="large"
            >
              <el-option
                v-for="version in leftVersions"
                :key="'left-' + version"
                :label="version"
                :value="version"
              >
                <span style="font-family: monospace;">v{{ version }}</span>
              </el-option>
            </el-select>
            
            <div v-if="leftVersion" class="version-hash">
              <span class="label">MD5:</span>
              <code v-if="sourceType === 'local'">
                {{ projectStore.getBuildHistory(selectedProjectId || '').find(h => h.version === leftVersion)?.md5 || '-' }}
              </code>
              <code v-else>
                {{ remoteArchives.find(a => a.version === leftVersion && a.projectId === selectedProjectId)?.md5 || '-' }}
              </code>
            </div>
          </div>

          <div class="swap-button">
            <el-button circle size="large" @click="swapVersions">
              <el-icon><Switch /></el-icon>
            </el-button>
            <el-button
              v-if="leftVersion && configStore.isConnected && !isRollingBack"
              circle
              size="large"
              type="warning"
              title="回滚到此版本"
              @click="rollbackToVersion(leftVersion)"
            >
              <el-icon><RefreshLeft /></el-icon>
            </el-button>
          </div>

          <div class="version-column">
            <label class="version-label">对比版本</label>
            <el-select
              v-model="rightVersion"
              placeholder="选择新版本"
              style="width: 100%;"
              size="large"
            >
              <el-option
                v-for="version in rightVersions"
                :key="'right-' + version"
                :label="version"
                :value="version"
              >
                <span style="font-family: monospace;">v{{ version }}</span>
              </el-option>
            </el-select>
            
            <div v-if="rightVersion" class="version-hash">
              <span class="label">MD5:</span>
              <code v-if="sourceType === 'local'">
                {{ projectStore.getBuildHistory(selectedProjectId || '').find(h => h.version === rightVersion)?.md5 || '-' }}
              </code>
              <code v-else>
                {{ remoteArchives.find(a => a.version === rightVersion && a.projectId === selectedProjectId)?.md5 || '-' }}
              </code>
            </div>
          </div>
        </div>

        <div v-if="isComparing" class="comparing">
          <el-icon :size="32" class="loading"><Loading /></el-icon>
          <p>正在分析版本差异...</p>
        </div>

        <div v-else-if="diffResult" class="diff-results">
          <div class="diff-summary">
            <div class="summary-card">
              <div class="stat-icon primary">
                <el-icon :size="24"><Files /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-label">文件变更</div>
                <div class="stat-value">{{ diffResult.changes.length }}</div>
              </div>
            </div>
            
            <div class="summary-card">
              <div class="stat-icon" :class="diffResult.sizeDiff >= 0 ? 'danger' : 'success'">
                <el-icon :size="24">
                  <component :is="getDiffIcon(diffResult.sizeDiff)" />
                </el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-label">大小变化</div>
                <div class="stat-value" :class="getDiffColor(diffResult.sizeDiff)">
                  {{ diffResult.sizeDiff >= 0 ? '+' : '' }}{{ formatFileSize(diffResult.sizeDiff) }}
                </div>
              </div>
            </div>
            
            <div class="summary-card">
              <div class="stat-icon success">
                <el-icon :size="24"><Plus /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-label">新增行数</div>
                <div class="stat-value text-success">
                  +{{ diffResult.changes.reduce((a, c) => a + c.linesAdded, 0) }}
                </div>
              </div>
            </div>
            
            <div class="summary-card">
              <div class="stat-icon danger">
                <el-icon :size="24"><Minus /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-label">删除行数</div>
                <div class="stat-value text-danger">
                  -{{ diffResult.changes.reduce((a, c) => a + c.linesDeleted, 0) }}
                </div>
              </div>
            </div>
          </div>

          <div class="sections-card card">
            <div class="card-header">
              <h3 class="card-title">段大小分析</h3>
            </div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>段名称</th>
                  <th>{{ diffResult.leftVersion }}</th>
                  <th>{{ diffResult.rightVersion }}</th>
                  <th>变化</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="section in diffResult.sections" :key="section.name">
                  <td><code>{{ section.name }}</code></td>
                  <td>{{ formatFileSize(section.leftSize) }}</td>
                  <td>{{ formatFileSize(section.rightSize) }}</td>
                  <td :class="getDiffColor(section.diff)">
                    <el-icon>
                      <component :is="getDiffIcon(section.diff)" />
                    </el-icon>
                    {{ section.diff >= 0 ? '+' : '' }}{{ formatFileSize(section.diff) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="changes-card card">
            <div class="card-header">
              <h3 class="card-title">变更文件列表</h3>
              <span class="badge badge-info">{{ diffResult.changes.length }} 个文件</span>
            </div>
            <div class="change-list">
              <div
                v-for="change in diffResult.changes"
                :key="change.file"
                class="change-item"
                @click="showFileDiffDetail(change.file)"
              >
                <span :class="['status-tag', getChangeTypeClass(change.type)]">
                  {{ getChangeTypeText(change.type) }}
                </span>
                <span class="change-file">{{ change.file }}</span>
                <div class="change-stats">
                  <span class="text-success">+{{ change.linesAdded }}</span>
                  <span class="text-danger">-{{ change.linesDeleted }}</span>
                </div>
                <el-icon><ArrowRight /></el-icon>
              </div>
              
              <div v-if="diffResult.changes.length === 0" class="empty-state small">
                <p>暂无文件变更</p>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="diff-empty">
          <el-icon :size="64" color="var(--el-text-color-secondary)"><Comparison /></el-icon>
          <h3>选择两个版本进行对比</h3>
          <p>对比固件版本之间的大小、内容、哈希值差异</p>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="showFileDiff"
      :title="'文件差异: ' + selectedFile"
      width="1000px"
      class="file-diff-dialog"
    >
      <div v-if="fileDiffContent" class="file-diff-content">
        <div class="diff-column">
          <div class="diff-header">{{ leftVersion }} (旧)</div>
          <pre class="diff-text old"><component :is="renderDiffLeft" /></pre>
        </div>
        <div class="diff-column">
          <div class="diff-header">{{ rightVersion }} (新)</div>
          <pre class="diff-text new"><component :is="renderDiffRight" /></pre>
        </div>
      </div>
      <div v-else class="file-diff-loading">
        <el-icon :size="32" class="loading"><Loading /></el-icon>
        <p>正在加载差异...</p>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.diff-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  height: calc(100vh - 180px);
}

.project-panel,
.diff-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
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

.panel-title {
  font-weight: 600;
  font-size: 14px;
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
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 4px;
}

.project-item:hover {
  background: var(--el-fill-color-light);
}

.project-item.active {
  background: var(--el-color-primary-light-9);
}

.project-info {
  flex: 1;
  min-width: 0;
}

.project-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-version {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.version-selector {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 16px;
  padding: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-page);
}

.version-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.version-hash {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.version-hash .label {
  margin-right: 4px;
}

.version-hash code {
  font-size: 11px;
  background: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 4px;
}

.swap-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 24px;
}

.comparing {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--el-text-color-secondary);
}

.comparing .loading {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.diff-results {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.diff-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.stat-info {
  flex: 1;
}

.stat-label {
  font-size: 13px;
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

.text-info {
  color: var(--el-color-info);
}

.sections-card,
.changes-card {
  padding: 0;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.data-table th {
  background: var(--el-bg-color-page);
  font-weight: 500;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.data-table td {
  font-size: 14px;
}

.data-table tr:hover td {
  background: var(--el-fill-color-light);
}

.change-list {
  padding: 8px;
}

.change-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.change-item:hover {
  background: var(--el-fill-color-light);
}

.change-file {
  flex: 1;
  font-family: monospace;
  font-size: 13px;
}

.change-stats {
  display: flex;
  gap: 12px;
  font-family: monospace;
  font-size: 13px;
  font-weight: 600;
}

.diff-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

.diff-empty h3 {
  margin: 0;
  font-size: 18px;
}

.empty-state.small {
  padding: 30px 20px;
}

.empty-state.small .el-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.empty-state.small p {
  font-size: 13px;
}

.file-diff-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.file-diff-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--el-border-color-lighter);
}

.diff-column {
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
}

.diff-header {
  padding: 12px 16px;
  background: var(--el-bg-color-page);
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-weight: 500;
  font-family: monospace;
}

.diff-text {
  flex: 1;
  margin: 0;
  padding: 16px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  max-height: 500px;
  overflow-y: auto;
  white-space: pre;
}

.diff-text.old {
  background: #fff5f5;
}

.diff-text.new {
  background: #f0fff4;
}

.file-diff-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

.file-diff-loading .loading {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

:deep(.dark) {
  .diff-text.old {
    background: rgba(245, 108, 108, 0.1);
  }
  
  .diff-text.new {
    background: rgba(103, 194, 58, 0.1);
  }
}
</style>
