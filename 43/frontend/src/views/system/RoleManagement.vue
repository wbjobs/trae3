<template>
  <div class="role-management">
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="角色名称">
          <el-input v-model="searchForm.roleName" placeholder="请输入角色名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button @click="handleReset">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <div class="table-header">
        <el-button type="primary" @click="handleAdd">
          <el-icon><Plus /></el-icon>
          新增角色
        </el-button>
      </div>

      <el-table
        :data="tableData"
        border
        stripe
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="roleName" label="角色名称" min-width="150" />
        <el-table-column prop="roleCode" label="角色编码" min-width="150" />
        <el-table-column prop="description" label="角色描述" min-width="200" show-overflow-tooltip />
        <el-table-column label="权限数量" width="120">
          <template #default="{ row }">
            <el-tag type="success">{{ (row.permissions || []).length }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
            <el-button type="success" link @click="handleAssignPermission(row)">分配权限</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑角色' : '新增角色'"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
      >
        <el-form-item label="角色名称" prop="roleName">
          <el-input v-model="formData.roleName" placeholder="请输入角色名称" />
        </el-form-item>
        <el-form-item label="角色编码" prop="roleCode">
          <el-input v-model="formData.roleCode" placeholder="请输入角色编码" />
        </el-form-item>
        <el-form-item label="角色描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入角色描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="permissionDialogVisible"
      title="分配权限"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="permission-toolbar">
        <el-button size="small" @click="handleCheckAll">全选</el-button>
        <el-button size="small" @click="handleUncheckAll">取消全选</el-button>
        <span class="permission-count">已选择 {{ checkedPermissions.length }} 项</span>
      </div>
      <el-tree
        ref="treeRef"
        :data="permissionTree"
        :props="treeProps"
        show-checkbox
        node-key="id"
        default-expand-all
        class="permission-tree"
        @check="handleTreeCheck"
      >
        <template #default="{ node, data }">
          <span class="custom-tree-node">
            <span>{{ data.label }}</span>
            <span v-if="data.children" class="tree-count">({{ data.children.length }})</span>
          </span>
        </template>
      </el-tree>
      <template #footer>
        <el-button @click="permissionDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="permissionLoading" @click="handlePermissionSubmit">确定保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import {
  getRoleList,
  createRole,
  updateRole,
  deleteRole,
  getPermissionList,
  assignRolePermissions
} from '@/api/role'

const loading = ref(false)
const submitLoading = ref(false)
const permissionLoading = ref(false)
const dialogVisible = ref(false)
const permissionDialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const treeRef = ref(null)

const searchForm = reactive({
  roleName: ''
})

const tableData = ref([])
const allPermissions = ref([])
const currentRole = ref(null)
const checkedPermissions = ref([])

const moduleMap = {
  application: '申请管理',
  approval: '审批管理',
  ledger: '台账管理',
  system: '系统管理'
}

const permissionTree = computed(() => {
  const modules = {}
  allPermissions.value.forEach((p) => {
    const moduleName = p.module || 'other'
    if (!modules[moduleName]) {
      modules[moduleName] = {
        id: `module-${moduleName}`,
        label: moduleMap[moduleName] || moduleName,
        permissionCode: moduleName,
        children: []
      }
    }
    modules[moduleName].children.push({
      id: p.id,
      label: p.permissionName,
      permissionCode: p.permissionCode,
      description: p.description
    })
  })
  return Object.values(modules)
})

const treeProps = {
  children: 'children',
  label: 'label'
}

const formData = reactive({
  id: null,
  roleName: '',
  roleCode: '',
  description: ''
})

const formRules = {
  roleName: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  roleCode: [{ required: true, message: '请输入角色编码', trigger: 'blur' }]
}

const formatDate = (date) => {
  return date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'
}

const fetchRoleList = async () => {
  loading.value = true
  try {
    const res = await getRoleList(searchForm.roleName ? { keyword: searchForm.roleName } : {})
    let list = res || []
    if (searchForm.roleName) {
      list = list.filter((r) => r.roleName.includes(searchForm.roleName))
    }
    tableData.value = list
  } catch (error) {
    console.error('获取角色列表失败:', error)
  } finally {
    loading.value = false
  }
}

const fetchPermissionList = async () => {
  try {
    const res = await getPermissionList()
    allPermissions.value = res || []
  } catch (error) {
    console.error('获取权限列表失败:', error)
  }
}

const handleSearch = () => {
  fetchRoleList()
}

const handleReset = () => {
  searchForm.roleName = ''
  fetchRoleList()
}

const handleAdd = () => {
  isEdit.value = false
  formData.id = null
  formData.roleName = ''
  formData.roleCode = ''
  formData.description = ''
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  formData.id = row.id
  formData.roleName = row.roleName
  formData.roleCode = row.roleCode
  formData.description = row.description
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitLoading.value = true
      try {
        const data = {
          roleName: formData.roleName,
          roleCode: formData.roleCode,
          description: formData.description
        }
        if (!isEdit.value) {
          await createRole(data)
          ElMessage.success('创建成功')
        } else {
          await updateRole(formData.id, data)
          ElMessage.success('更新成功')
        }
        dialogVisible.value = false
        fetchRoleList()
      } catch (error) {
        console.error('提交失败:', error)
      } finally {
        submitLoading.value = false
      }
    }
  })
}

const handleDelete = (row) => {
  ElMessageBox.confirm(`确定要删除角色 "${row.roleName}" 吗？`, '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await deleteRole(row.id)
      ElMessage.success('删除成功')
      fetchRoleList()
    } catch (error) {
      console.error('删除失败:', error)
    }
  }).catch(() => {})
}

const handleAssignPermission = (row) => {
  currentRole.value = row
  checkedPermissions.value = [...(row.permissions || [])]
  permissionDialogVisible.value = true

  setTimeout(() => {
    if (treeRef.value) {
      const checkedKeys = []
      const halfCheckedKeys = []
      allPermissions.value.forEach((p) => {
        if (checkedPermissions.value.includes(p.permissionCode)) {
          checkedKeys.push(p.id)
        }
      })
      treeRef.value.setCheckedKeys(checkedKeys)
    }
  }, 100)
}

const handleTreeCheck = () => {
  if (treeRef.value) {
    const checkedNodes = treeRef.value.getCheckedNodes(false, true)
    checkedPermissions.value = checkedNodes
      .filter((n) => n.permissionCode && !n.permissionCode.startsWith('module-'))
      .map((n) => n.permissionCode)
  }
}

const handleCheckAll = () => {
  if (treeRef.value) {
    treeRef.value.setCheckedKeys(allPermissions.value.map((p) => p.id))
    handleTreeCheck()
  }
}

const handleUncheckAll = () => {
  if (treeRef.value) {
    treeRef.value.setCheckedKeys([])
    checkedPermissions.value = []
  }
}

const handlePermissionSubmit = async () => {
  if (!currentRole.value) return
  permissionLoading.value = true
  try {
    await assignRolePermissions(currentRole.value.id, checkedPermissions.value)
    ElMessage.success('权限分配成功')
    permissionDialogVisible.value = false
    fetchRoleList()
  } catch (error) {
    console.error('分配权限失败:', error)
  } finally {
    permissionLoading.value = false
  }
}

onMounted(() => {
  fetchRoleList()
  fetchPermissionList()
})
</script>

<style scoped>
.role-management {
  padding: 20px;
}

.search-card {
  margin-bottom: 20px;
}

.search-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.table-card {
  border-radius: 8px;
}

.table-header {
  margin-bottom: 16px;
  display: flex;
  justify-content: flex-end;
}

.permission-toolbar {
  margin-bottom: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.permission-count {
  margin-left: auto;
  color: #606266;
  font-size: 14px;
}

.permission-tree {
  max-height: 400px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}

.custom-tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tree-count {
  color: #909399;
  font-size: 12px;
}

:deep(.el-table__row) {
  transition: background-color 0.2s;
}

:deep(.el-table__row:hover) {
  background-color: #f5f7fa !important;
}
</style>
