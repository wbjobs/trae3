<template>
  <div class="permission-management">
    <el-card class="main-card">
      <div class="card-header">
        <h3 class="title">
          <el-icon><Key /></el-icon>
          系统权限列表
        </h3>
        <div class="stats">
          <el-tag type="primary">共 {{ totalCount }} 个权限</el-tag>
          <el-tag type="success">{{ moduleCount }} 个模块</el-tag>
        </div>
      </div>

      <div class="tree-container" v-loading="loading">
        <el-tree
          :data="permissionTree"
          :props="treeProps"
          node-key="id"
          default-expand-all
          class="permission-tree"
        >
          <template #default="{ node, data }">
            <div class="tree-node-content">
              <div class="node-main">
                <el-icon v-if="data.children" class="module-icon"><Folder /></el-icon>
                <el-icon v-else class="permission-icon"><Lock /></el-icon>
                <span class="node-label">{{ data.label }}</span>
              </div>
              <div class="node-meta" v-if="!data.children">
                <el-tag size="small" type="info">{{ data.permissionCode }}</el-tag>
                <span v-if="data.description" class="node-desc">{{ data.description }}</span>
              </div>
              <el-tag v-if="data.children" size="small" type="success">{{ data.children.length }} 项</el-tag>
            </div>
          </template>
        </el-tree>
      </div>

      <div class="legend">
        <div class="legend-item">
          <el-icon><Folder /></el-icon>
          <span>模块分组</span>
        </div>
        <div class="legend-item">
          <el-icon><Lock /></el-icon>
          <span>具体权限</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Key, Folder, Lock } from '@element-plus/icons-vue'
import { getPermissionList } from '@/api/role'

const loading = ref(false)
const allPermissions = ref([])

const moduleMap = {
  application: '申请管理',
  approval: '审批管理',
  ledger: '台账管理',
  system: '系统管理'
}

const moduleIcons = {
  application: 'Document',
  approval: 'Check',
  ledger: 'Notebook',
  system: 'Setting'
}

const permissionTree = computed(() => {
  const modules = {}
  allPermissions.value.forEach((p) => {
    const moduleName = p.module || 'other'
    if (!modules[moduleName]) {
      modules[moduleName] = {
        id: `module-${moduleName}`,
        label: moduleMap[moduleName] || moduleName,
        icon: moduleIcons[moduleName] || 'Folder',
        children: []
      }
    }
    modules[moduleName].children.push({
      id: p.id,
      label: p.permissionName,
      permissionCode: p.permissionCode,
      description: p.description,
      module: p.module
    })
  })

  const moduleOrder = ['application', 'approval', 'ledger', 'system', 'other']
  return moduleOrder
    .filter((m) => modules[m])
    .map((m) => modules[m])
})

const totalCount = computed(() => allPermissions.value.length)

const moduleCount = computed(() => {
  const modules = new Set(allPermissions.value.map((p) => p.module))
  return modules.size
})

const treeProps = {
  children: 'children',
  label: 'label'
}

const fetchPermissionList = async () => {
  loading.value = true
  try {
    const res = await getPermissionList()
    allPermissions.value = res || []
  } catch (error) {
    console.error('获取权限列表失败:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchPermissionList()
})
</script>

<style scoped>
.permission-management {
  padding: 20px;
}

.main-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
}

.title :deep(.el-icon) {
  color: #409eff;
}

.stats {
  display: flex;
  gap: 10px;
}

.tree-container {
  padding: 10px;
}

.permission-tree {
  background: #fafafa;
  border-radius: 8px;
  padding: 16px;
}

.tree-node-content {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 4px 0;
}

.node-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.module-icon {
  color: #e6a23c;
  font-size: 18px;
}

.permission-icon {
  color: #67c23a;
  font-size: 16px;
}

.node-label {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.node-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.node-desc {
  font-size: 12px;
  color: #909399;
}

.legend {
  display: flex;
  gap: 30px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #606266;
}

.legend-item :deep(.el-icon) {
  font-size: 16px;
}

.legend-item:first-child :deep(.el-icon) {
  color: #e6a23c;
}

.legend-item:last-child :deep(.el-icon) {
  color: #67c23a;
}

:deep(.el-tree-node__content) {
  height: 40px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

:deep(.el-tree-node__content:hover) {
  background-color: #ecf5ff !important;
}

:deep(.el-tree-node.is-current > .el-tree-node__content) {
  background-color: #ecf5ff;
}
</style>
