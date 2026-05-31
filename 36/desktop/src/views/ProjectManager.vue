<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useProjectStore } from '@/stores/projectStore';
import { useConfigStore } from '@/stores/configStore';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FirmwareProject, CompilerConfig } from '@shared/types';
import { generateId } from '@shared/utils';

const projectStore = useProjectStore();
const configStore = useConfigStore();

const searchKeyword = ref('');
const filterType = ref<FirmwareProject['type'] | 'all'>('all');
const showAddDialog = ref(false);
const showEditDialog = ref(false);
const showImportDialog = ref(false);
const currentProject = ref<FirmwareProject | null>(null);

const formData = ref({
  name: '',
  path: '',
  type: 'stm32' as FirmwareProject['type'],
  version: '1.0.0',
  description: '',
  compiler: {
    type: 'gcc-arm' as CompilerConfig['type'],
    path: '',
    args: [] as string[],
    buildCommand: 'make',
    cleanCommand: 'make clean',
    outputPattern: '\\.elf$|\\.bin$|\\.hex$'
  } as CompilerConfig,
  tags: [] as string[]
});

const projectTypes = [
  { value: 'stm32', label: 'STM32', icon: 'Cpu' },
  { value: 'esp32', label: 'ESP32', icon: 'Wifi' },
  { value: 'nrf52', label: 'nRF52', icon: 'Connection' },
  { value: 'custom', label: '自定义', icon: 'Setting' }
];

const compilerTypes = [
  { value: 'gcc-arm', label: 'GCC ARM', defaultCmd: 'make', defaultPattern: '\\.elf$|\\.bin$|\\.hex$' },
  { value: 'xtensa', label: 'Xtensa ESP32', defaultCmd: 'idf.py build', defaultPattern: '\\.bin$|\\.elf$' },
  { value: 'keil', label: 'Keil MDK', defaultCmd: 'UV4 -b', defaultPattern: '\\.axf$|\\.hex$|\\.bin$' },
  { value: 'iar', label: 'IAR', defaultCmd: 'iarbuild', defaultPattern: '\\.out$|\\.hex$|\\.bin$' },
  { value: 'custom', label: '自定义', defaultCmd: '', defaultPattern: '.*' }
];

const filteredProjects = computed(() => {
  let projects = projectStore.projects;
  
  if (filterType.value !== 'all') {
    projects = projects.filter(p => p.type === filterType.value);
  }
  
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase();
    projects = projects.filter(p =>
      p.name.toLowerCase().includes(keyword) ||
      p.description.toLowerCase().includes(keyword) ||
      p.tags.some(t => t.toLowerCase().includes(keyword))
    );
  }
  
  return projects;
});

const tableColumns = [
  { prop: 'name', label: '工程名称', width: 180 },
  { prop: 'type', label: '芯片类型', width: 100 },
  { prop: 'version', label: '版本', width: 100 },
  { prop: 'path', label: '路径', minWidth: 200 },
  { prop: 'updatedAt', label: '更新时间', width: 180 },
  { prop: 'lastBuild', label: '上次编译', width: 120 },
  { prop: 'actions', label: '操作', width: 200, fixed: 'right' }
];

function openAddDialog() {
  formData.value = {
    name: '',
    path: '',
    type: 'stm32',
    version: '1.0.0',
    description: '',
    compiler: {
      type: 'gcc-arm',
      path: '',
      args: [],
      buildCommand: 'make',
      cleanCommand: 'make clean',
      outputPattern: '\\.elf$|\\.bin$|\\.hex$'
    },
    tags: []
  };
  showAddDialog.value = true;
}

function openEditDialog(project: FirmwareProject) {
  currentProject.value = project;
  formData.value = {
    name: project.name,
    path: project.path,
    type: project.type,
    version: project.version,
    description: project.description,
    compiler: { ...project.compiler },
    tags: [...project.tags]
  };
  showEditDialog.value = true;
}

async function selectProjectPath() {
  const path = await window.electronAPI.dialog.openDirectory();
  if (path) {
    formData.value.path = path;
    if (!formData.value.name) {
      formData.value.name = await window.electronAPI.path.basename(path);
    }
  }
}

async function selectCompilerPath() {
  const files = await window.electronAPI.dialog.openFile([
    { name: '可执行文件', extensions: ['exe', 'bat', 'sh', 'cmd'] }
  ]);
  if (files && files.length > 0) {
    formData.value.compiler.path = files[0];
  }
}

function onCompilerTypeChange(type: CompilerConfig['type']) {
  const compiler = compilerTypes.find(c => c.value === type);
  if (compiler) {
    formData.value.compiler.buildCommand = compiler.defaultCmd;
    formData.value.compiler.outputPattern = compiler.defaultPattern;
  }
}

async function handleAdd() {
  if (!formData.value.name || !formData.value.path) {
    ElMessage.warning('请填写工程名称和路径');
    return;
  }

  const exists = projectStore.projects.some(p => p.path === formData.value.path);
  if (exists) {
    ElMessage.warning('该路径的工程已存在');
    return;
  }

  projectStore.addProject(formData.value);
  ElMessage.success('工程添加成功');
  showAddDialog.value = false;
}

async function handleEdit() {
  if (!currentProject.value) return;
  
  projectStore.updateProject(currentProject.value.id, formData.value);
  ElMessage.success('工程更新成功');
  showEditDialog.value = false;
  currentProject.value = null;
}

async function handleDelete(project: FirmwareProject) {
  try {
    await ElMessageBox.confirm(
      `确定要删除工程 "${project.name}" 吗？此操作不可恢复。`,
      '删除确认',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      }
    );
    
    projectStore.deleteProject(project.id);
    ElMessage.success('工程删除成功');
  } catch {
  }
}

async function handleImport() {
  showImportDialog.value = true;
}

async function importFromDirectory() {
  const dirPath = await window.electronAPI.dialog.openDirectory();
  if (!dirPath) return;

  const files = await window.electronAPI.fs.listDirectory(dirPath);
  const projectDirs = files.filter(f => f.isDirectory);
  
  const importedProjects: Omit<FirmwareProject, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  
  for (const dir of projectDirs) {
    const projectFiles = await window.electronAPI.fs.listDirectory(dir.path);
    
    let detectedType: FirmwareProject['type'] = 'custom';
    let detectedCompiler: CompilerConfig | null = null;
    
    if (projectFiles.some(f => f.name.includes('.ioc') || f.name.includes('STM32'))) {
      detectedType = 'stm32';
      detectedCompiler = {
        type: 'gcc-arm',
        path: '',
        args: [],
        buildCommand: 'make',
        cleanCommand: 'make clean',
        outputPattern: '\\.elf$|\\.bin$|\\.hex$'
      };
    } else if (projectFiles.some(f => f.name === 'CMakeLists.txt' && f.name.includes('esp'))) {
      detectedType = 'esp32';
      detectedCompiler = {
        type: 'xtensa',
        path: '',
        args: [],
        buildCommand: 'idf.py build',
        outputPattern: '\\.bin$|\\.elf$'
      };
    } else if (projectFiles.some(f => f.name.endsWith('.uvprojx'))) {
      detectedType = 'stm32';
      detectedCompiler = {
        type: 'keil',
        path: '',
        args: [],
        buildCommand: 'UV4 -b',
        outputPattern: '\\.axf$|\\.hex$|\\.bin$'
      };
    }
    
    importedProjects.push({
      name: dir.name,
      path: dir.path,
      type: detectedType,
      compiler: detectedCompiler || formData.value.compiler,
      version: '1.0.0',
      description: `自动导入: ${dir.name}`,
      tags: ['auto-imported'],
      lastBuild: undefined
    });
  }
  
  if (importedProjects.length > 0) {
    const newProjects = projectStore.importProjects(importedProjects);
    ElMessage.success(`成功导入 ${newProjects.length} 个工程`);
    showImportDialog.value = false;
  } else {
    ElMessage.warning('未找到可导入的工程');
  }
}

async function importFromJson() {
  const files = await window.electronAPI.dialog.openFile([
    { name: 'JSON 文件', extensions: ['json'] }
  ]);
  
  if (!files || files.length === 0) return;
  
  try {
    const content = await window.electronAPI.fs.readFile(files[0], 'utf-8');
    const importedData = JSON.parse(content);
    
    const projectsToImport: Omit<FirmwareProject, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    
    if (Array.isArray(importedData)) {
      for (const item of importedData) {
        if (item.name && item.path) {
          projectsToImport.push({
            name: item.name,
            path: item.path,
            type: item.type || 'custom',
            compiler: item.compiler || formData.value.compiler,
            version: item.version || '1.0.0',
            description: item.description || '',
            tags: item.tags || [],
            lastBuild: undefined
          });
        }
      }
    }
    
    if (projectsToImport.length > 0) {
      const newProjects = projectStore.importProjects(projectsToImport);
      ElMessage.success(`成功导入 ${newProjects.length} 个工程`);
      showImportDialog.value = false;
    } else {
      ElMessage.warning('JSON 文件格式不正确');
    }
  } catch (error) {
    ElMessage.error('导入失败: ' + (error as Error).message);
  }
}

async function exportProject(project: FirmwareProject) {
  const exportData = JSON.stringify(project, null, 2);
  const savePath = await window.electronAPI.dialog.saveFile(`${project.name}.json`);
  
  if (savePath) {
    await window.electronAPI.fs.writeFile(savePath, exportData);
    ElMessage.success('工程导出成功');
  }
}

async function openInExplorer(project: FirmwareProject) {
  await window.electronAPI.shell.openPath(project.path);
}

function getStatusTag(status?: string) {
  if (!status) return { text: '未编译', class: 'status-pending' };
  switch (status) {
    case 'success': return { text: '成功', class: 'status-success' };
    case 'failed': return { text: '失败', class: 'status-error' };
    case 'building': return { text: '编译中', class: 'status-building' };
    default: return { text: status, class: 'status-pending' };
  }
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN');
}

function formatFileSize(size?: number) {
  if (!size) return '-';
  const kb = size / 1024;
  if (kb < 1024) return kb.toFixed(2) + ' KB';
  return (kb / 1024).toFixed(2) + ' MB';
}

onMounted(() => {
  configStore.detectCompilers();
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">工程管理</h1>
      <div style="display: flex; gap: 12px;">
        <el-button type="primary" @click="handleImport">
          <el-icon><Upload /></el-icon>
          批量导入
        </el-button>
        <el-button type="success" @click="openAddDialog">
          <el-icon><Plus /></el-icon>
          新建工程
        </el-button>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          class="search-box"
          placeholder="搜索工程名称、描述、标签..."
          clearable
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select v-model="filterType" style="width: 140px;">
          <el-option label="全部类型" value="all" />
          <el-option
            v-for="type in projectTypes"
            :key="type.value"
            :label="type.label"
            :value="type.value"
          />
        </el-select>
      </div>
      <div class="toolbar-right">
        <span class="badge badge-info">共 {{ filteredProjects.length }} 个工程</span>
      </div>
    </div>

    <div class="table-container" v-if="filteredProjects.length > 0">
      <el-table :data="filteredProjects" stripe style="width: 100%" :row-height="56">
        <el-table-column prop="name" label="工程名称" width="200">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px;">
              <el-icon :size="18" color="var(--el-color-primary)">
                <component :is="projectTypes.find(t => t.value === row.type)?.icon || 'Folder'" />
              </el-icon>
              <strong>{{ row.name }}</strong>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column prop="type" label="芯片类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">
              {{ projectTypes.find(t => t.value === row.type)?.label || row.type }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column prop="version" label="版本" width="100">
          <template #default="{ row }">
            <code style="background: var(--el-fill-color); padding: 2px 6px; border-radius: 4px;">
              {{ row.version }}
            </code>
          </template>
        </el-table-column>
        
        <el-table-column prop="path" label="工程路径" min-width="250" show-overflow-tooltip />
        
        <el-table-column prop="updatedAt" label="更新时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.updatedAt) }}
          </template>
        </el-table-column>
        
        <el-table-column prop="lastBuild" label="上次编译" width="180">
          <template #default="{ row }">
            <div v-if="row.lastBuild">
              <span :class="['status-tag', getStatusTag(row.lastBuild.status).class]">
                {{ getStatusTag(row.lastBuild.status).text }}
              </span>
              <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px;">
                {{ formatFileSize(row.lastBuild.size) }}
              </div>
            </div>
            <span v-else :class="['status-tag', 'status-pending']">未编译</span>
          </template>
        </el-table-column>
        
        <el-table-column label="标签" width="120">
          <template #default="{ row }">
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              <el-tag
                v-for="tag in row.tags.slice(0, 3)"
                :key="tag"
                size="small"
                type="info"
              >
                {{ tag }}
              </el-tag>
              <el-tag v-if="row.tags.length > 3" size="small" type="info">
                +{{ row.tags.length - 3 }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <div style="display: flex; gap: 4px;">
              <el-button size="small" text @click="openInExplorer(row)">
                <el-icon><FolderOpened /></el-icon>
              </el-button>
              <el-button size="small" text type="primary" @click="exportProject(row)">
                <el-icon><Download /></el-icon>
              </el-button>
              <el-button size="small" text type="primary" @click="openEditDialog(row)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button size="small" text type="danger" @click="handleDelete(row)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="empty-state" v-else>
      <el-icon><Folder /></el-icon>
      <p class="empty-state-text">暂无工程，点击"新建工程"或"批量导入"添加</p>
    </div>

    <el-dialog
      v-model="showAddDialog"
      title="新建工程"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="formData" label-width="100px">
        <el-form-item label="工程名称" required>
          <el-input v-model="formData.name" placeholder="请输入工程名称" />
        </el-form-item>
        
        <el-form-item label="工程路径" required>
          <div style="display: flex; gap: 8px;">
            <el-input v-model="formData.path" placeholder="请选择工程目录" />
            <el-button @click="selectProjectPath">
              <el-icon><Folder /></el-icon>
              浏览
            </el-button>
          </div>
        </el-form-item>
        
        <el-form-item label="芯片类型">
          <el-select v-model="formData.type" style="width: 100%;">
            <el-option
              v-for="type in projectTypes"
              :key="type.value"
              :label="type.label"
              :value="type.value"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="版本号">
          <el-input v-model="formData.version" placeholder="例如: 1.0.0" />
        </el-form-item>
        
        <el-form-item label="描述">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="2"
            placeholder="工程描述"
          />
        </el-form-item>
        
        <el-divider content-position="left">编译器配置</el-divider>
        
        <el-form-item label="编译器类型">
          <el-select
            v-model="formData.compiler.type"
            style="width: 100%;"
            @change="onCompilerTypeChange"
          >
            <el-option
              v-for="compiler in compilerTypes"
              :key="compiler.value"
              :label="compiler.label"
              :value="compiler.value"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="编译器路径">
          <div style="display: flex; gap: 8px;">
            <el-input v-model="formData.compiler.path" placeholder="可选，自动检测" />
            <el-button @click="selectCompilerPath">
              <el-icon><Document /></el-icon>
              选择
            </el-button>
          </div>
        </el-form-item>
        
        <el-form-item label="编译命令">
          <el-input v-model="formData.compiler.buildCommand" placeholder="例如: make" />
        </el-form-item>
        
        <el-form-item label="清理命令">
          <el-input v-model="formData.compiler.cleanCommand" placeholder="例如: make clean" />
        </el-form-item>
        
        <el-form-item label="输出文件匹配">
          <el-input v-model="formData.compiler.outputPattern" placeholder="正则表达式" />
        </el-form-item>
        
        <el-form-item label="标签">
          <el-select
            v-model="formData.tags"
            multiple
            filterable
            allow-create
            placeholder="按回车添加标签"
            style="width: 100%;"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <div class="form-actions">
          <el-button @click="showAddDialog = false">取消</el-button>
          <el-button type="primary" @click="handleAdd">创建</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showEditDialog"
      title="编辑工程"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="formData" label-width="100px">
        <el-form-item label="工程名称" required>
          <el-input v-model="formData.name" />
        </el-form-item>
        
        <el-form-item label="工程路径" required>
          <div style="display: flex; gap: 8px;">
            <el-input v-model="formData.path" />
            <el-button @click="selectProjectPath">浏览</el-button>
          </div>
        </el-form-item>
        
        <el-form-item label="芯片类型">
          <el-select v-model="formData.type" style="width: 100%;">
            <el-option
              v-for="type in projectTypes"
              :key="type.value"
              :label="type.label"
              :value="type.value"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="版本号">
          <el-input v-model="formData.version" />
        </el-form-item>
        
        <el-form-item label="描述">
          <el-input v-model="formData.description" type="textarea" :rows="2" />
        </el-form-item>
        
        <el-divider content-position="left">编译器配置</el-divider>
        
        <el-form-item label="编译器类型">
          <el-select
            v-model="formData.compiler.type"
            style="width: 100%;"
            @change="onCompilerTypeChange"
          >
            <el-option
              v-for="compiler in compilerTypes"
              :key="compiler.value"
              :label="compiler.label"
              :value="compiler.value"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="编译器路径">
          <div style="display: flex; gap: 8px;">
            <el-input v-model="formData.compiler.path" />
            <el-button @click="selectCompilerPath">选择</el-button>
          </div>
        </el-form-item>
        
        <el-form-item label="编译命令">
          <el-input v-model="formData.compiler.buildCommand" />
        </el-form-item>
        
        <el-form-item label="清理命令">
          <el-input v-model="formData.compiler.cleanCommand" />
        </el-form-item>
        
        <el-form-item label="输出匹配">
          <el-input v-model="formData.compiler.outputPattern" />
        </el-form-item>
        
        <el-form-item label="标签">
          <el-select
            v-model="formData.tags"
            multiple
            filterable
            allow-create
            style="width: 100%;"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <div class="form-actions">
          <el-button @click="showEditDialog = false; currentProject = null">取消</el-button>
          <el-button type="primary" @click="handleEdit">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showImportDialog"
      title="批量导入工程"
      width="500px"
    >
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 20px 0;">
        <el-card
          class="import-card"
          shadow="hover"
          @click="importFromDirectory"
        >
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="stat-icon primary">
              <el-icon :size="24"><FolderOpened /></el-icon>
            </div>
            <div>
              <h4 style="margin: 0 0 4px;">从目录批量导入</h4>
              <p style="margin: 0; font-size: 13px; color: var(--el-text-color-secondary);">
                自动扫描目录中的子目录，识别 STM32、ESP32 等工程
              </p>
            </div>
          </div>
        </el-card>
        
        <el-card
          class="import-card"
          shadow="hover"
          @click="importFromJson"
        >
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="stat-icon success">
              <el-icon :size="24"><Document /></el-icon>
            </div>
            <div>
              <h4 style="margin: 0 0 4px;">从 JSON 导入</h4>
              <p style="margin: 0; font-size: 13px; color: var(--el-text-color-secondary);">
                导入已导出的工程配置 JSON 文件
              </p>
            </div>
          </div>
        </el-card>
      </div>
      
      <template #footer>
        <div class="form-actions">
          <el-button @click="showImportDialog = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.import-card {
  cursor: pointer;
  transition: all 0.2s ease;
}

.import-card:hover {
  border-color: var(--el-color-primary);
  transform: translateX(4px);
}
</style>
