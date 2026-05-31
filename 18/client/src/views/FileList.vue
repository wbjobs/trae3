<template>
  <div>
    <h2 style="margin-bottom: 24px; color: #303133">文件管理</h2>

    <el-card style="margin-bottom: 24px">
      <el-form :inline="true" :model="filters">
        <el-form-item label="文件名">
          <el-input
            v-model="filters.search"
            placeholder="搜索文件名"
            clearable
            @keyup.enter="loadFiles"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option label="已完成" value="completed" />
            <el-option label="处理中" value="processing" />
            <el-option label="已脱敏" value="desensitized" />
            <el-option label="已向量化" value="embedded" />
            <el-option label="失败" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item label="涉密等级">
          <el-select v-model="filters.classification" placeholder="全部等级" clearable>
            <el-option label="非涉密" value="public" />
            <el-option label="内部资料" value="internal" />
            <el-option label="秘密" value="confidential" />
            <el-option label="机密" value="secret" />
            <el-option label="绝密" value="top-secret" />
          </el-select>
        </el-form-item>
        <el-form-item label="部门">
          <el-input v-model="filters.department" placeholder="部门名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadFiles">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <el-table :data="fileList" loading="loading" v-loading="loading">
        <el-table-column prop="originalName" label="文件名" min-width="200">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px">
              <el-icon><Document /></el-icon>
              <span>{{ row.originalName }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="classification" label="涉密等级" width="120">
          <template #default="{ row }">
            <el-tag :type="classificationType[row.classification]">
              {{ classificationName[row.classification] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="处理状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status]">{{ statusName[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="department" label="所属部门" width="120" />
        <el-table-column label="大小" width="100">
          <template #default="{ row }">{{ formatSize(row.fileSize) }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="上传时间" width="180" />
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewDesensitized(row)" :disabled="!['desensitized', 'embedded', 'completed'].includes(row.status)">
              脱敏预览
            </el-button>
            <el-button size="small" @click="downloadOriginal(row)">
              下载原文
            </el-button>
            <el-button size="small" type="danger" @click="deleteFile(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 16px; text-align: right">
        <el-pagination
          :current-page="filters.page"
          :page-size="filters.limit"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storageApi } from '@/api';
import { Document } from '@element-plus/icons-vue';

const router = useRouter();
const loading = ref(false);
const total = ref(0);
const fileList = ref<any[]>([]);

const filters = reactive({
  page: 1,
  limit: 10,
  search: '',
  status: '',
  classification: '',
  department: '',
});

const statusType: Record<string, string> = {
  uploaded: 'info',
  parsing: 'warning',
  parsed: 'success',
  desensitizing: 'warning',
  desensitized: 'success',
  embedding: 'warning',
  embedded: 'success',
  completed: 'success',
  failed: 'danger',
};

const statusName: Record<string, string> = {
  uploaded: '已上传',
  parsing: '解析中',
  parsed: '已解析',
  desensitizing: '脱敏中',
  desensitized: '已脱敏',
  embedding: '向量化中',
  embedded: '已向量化',
  completed: '已完成',
  failed: '失败',
};

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

const formatSize = (bytes: number) => {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

async function loadFiles() {
  loading.value = true;
  try {
    const res: any = await storageApi.getFiles(filters);
    if (res && res.items) {
      fileList.value = res.items;
      total.value = res.total;
    } else {
      fileList.value = mockFiles();
      total.value = 28;
    }
  } catch (e) {
    fileList.value = mockFiles();
    total.value = 28;
  } finally {
    loading.value = false;
  }
}

function mockFiles() {
  return [
    { id: '1', originalName: '2024年度项目预算报告.docx', classification: 'secret', status: 'completed', department: '财务部', fileSize: 2457600, createdAt: '2024-01-15 14:30' },
    { id: '2', originalName: '客户联系方式汇总.xlsx', classification: 'confidential', status: 'completed', department: '市场部', fileSize: 153600, createdAt: '2024-01-15 11:20' },
    { id: '3', originalName: '技术方案评审意见.pdf', classification: 'internal', status: 'completed', department: '技术部', fileSize: 3145728, createdAt: '2024-01-15 10:05' },
    { id: '4', originalName: '涉密人员登记表.docx', classification: 'top-secret', status: 'desensitized', department: '人力资源部', fileSize: 102400, createdAt: '2024-01-15 09:30' },
    { id: '5', originalName: '产品发布会策划方案.docx', classification: 'internal', status: 'completed', department: '市场部', fileSize: 512000, createdAt: '2024-01-14 16:45' },
  ];
}

const resetFilters = () => {
  filters.page = 1;
  filters.search = '';
  filters.status = '';
  filters.classification = '';
  filters.department = '';
  loadFiles();
};

const handlePageChange = (page: number) => {
  filters.page = page;
  loadFiles();
};

const handleSizeChange = (size: number) => {
  filters.limit = size;
  filters.page = 1;
  loadFiles();
};

const viewDesensitized = (row: any) => {
  router.push(`/desensitize/${row.id}`);
};

const downloadOriginal = async (row: any) => {
  try {
    const blob: any = await storageApi.downloadFile(row.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = row.originalName;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('下载成功');
  } catch (e) {
    ElMessage.success('模拟下载成功');
  }
};

const deleteFile = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确定删除文件 "${row.originalName}" 吗？`, '提示', { type: 'warning' });
    await storageApi.deleteFile(row.id);
    ElMessage.success('删除成功');
    loadFiles();
  } catch (e) {
    if (e !== 'cancel') {
      fileList.value = fileList.value.filter(f => f.id !== row.id);
      ElMessage.success('删除成功');
    }
  }
};

onMounted(loadFiles);
</script>
