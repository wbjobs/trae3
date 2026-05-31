<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/store/user'
import type { PageQuery } from '@/types'
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  RefreshCw,
  User,
  Shield,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-vue-next'

const userStore = useUserStore()

const users = ref<any[]>([])
const loading = ref(false)
const showDialog = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const currentUser = ref<any>(null)
const filters = ref({
  keyword: '',
  role: '',
  status: ''
})
const pagination = ref<PageQuery>({
  page: 1,
  pageSize: 20
})
const total = ref(0)

const roleOptions = [
  { value: '', label: '全部角色' },
  { value: 'admin', label: '管理员' },
  { value: 'operator', label: '运维人员' },
  { value: 'viewer', label: '只读用户' }
]

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '启用' },
  { value: 'disabled', label: '禁用' }
]

const formData = ref({
  username: '',
  password: '',
  name: '',
  email: '',
  phone: '',
  role: 'viewer',
  status: 'active'
})

const formRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于 6 个字符', trigger: 'blur' }
  ],
  name: [
    { required: true, message: '请输入姓名', trigger: 'blur' }
  ],
  email: [
    { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }
  ]
}

function getRoleText(role: string): string {
  const option = roleOptions.find(o => o.value === role)
  return option?.label || role
}

function getRoleClass(role: string): string {
  const classes: Record<string, string> = {
    admin: 'bg-danger/20 text-danger',
    operator: 'bg-warning/20 text-warning',
    viewer: 'bg-info/20 text-info'
  }
  return classes[role] || 'bg-dark-border text-dark-textSecondary'
}

function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    active: '启用',
    disabled: '禁用'
  }
  return texts[status] || '未知'
}

function getStatusClass(status: string): string {
  return status === 'active' ? 'text-success' : 'text-danger'
}

function generateMockUsers() {
  const mockUsers = [
    {
      id: 1,
      username: 'admin',
      name: '系统管理员',
      email: 'admin@example.com',
      phone: '13800138001',
      role: 'admin',
      status: 'active',
      lastLogin: '2024-01-15 10:30:00',
      createdAt: '2023-01-01 00:00:00'
    },
    {
      id: 2,
      username: 'operator1',
      name: '运维工程师A',
      email: 'op1@example.com',
      phone: '13800138002',
      role: 'operator',
      status: 'active',
      lastLogin: '2024-01-15 09:15:00',
      createdAt: '2023-06-01 10:00:00'
    },
    {
      id: 3,
      username: 'operator2',
      name: '运维工程师B',
      email: 'op2@example.com',
      phone: '13800138003',
      role: 'operator',
      status: 'active',
      lastLogin: '2024-01-14 16:45:00',
      createdAt: '2023-08-15 14:30:00'
    },
    {
      id: 4,
      username: 'viewer1',
      name: '业务查看员',
      email: 'viewer1@example.com',
      phone: '13800138004',
      role: 'viewer',
      status: 'active',
      lastLogin: '2024-01-13 11:20:00',
      createdAt: '2023-10-01 09:00:00'
    },
    {
      id: 5,
      username: 'viewer2',
      name: '临时用户',
      email: 'viewer2@example.com',
      phone: '13800138005',
      role: 'viewer',
      status: 'disabled',
      lastLogin: '2024-01-01 00:00:00',
      createdAt: '2023-11-01 10:00:00'
    }
  ]
  return mockUsers
}

async function fetchUsers() {
  try {
    loading.value = true
    await new Promise(resolve => setTimeout(resolve, 500))
    const allUsers = generateMockUsers()
    let filtered = [...allUsers]
    if (filters.value.keyword) {
      const kw = filters.value.keyword.toLowerCase()
      filtered = filtered.filter(u =>
        u.username.toLowerCase().includes(kw) ||
        u.name.toLowerCase().includes(kw) ||
        u.email.toLowerCase().includes(kw)
      )
    }
    if (filters.value.role) {
      filtered = filtered.filter(u => u.role === filters.value.role)
    }
    if (filters.value.status) {
      filtered = filtered.filter(u => u.status === filters.value.status)
    }
    users.value = filtered
    total.value = filtered.length
  } catch (error) {
    console.error('获取用户列表失败:', error)
  } finally {
    loading.value = false
  }
}

function handleCreate() {
  dialogMode.value = 'create'
  currentUser.value = null
  formData.value = {
    username: '',
    password: '',
    name: '',
    email: '',
    phone: '',
    role: 'viewer',
    status: 'active'
  }
  showDialog.value = true
}

function handleEdit(user: any) {
  dialogMode.value = 'edit'
  currentUser.value = user
  formData.value = {
    ...user,
    password: ''
  }
  showDialog.value = true
}

async function handleDelete(user: any) {
  try {
    await ElMessageBox.confirm(
      `确定要删除用户 "${user.name}" 吗？`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    ElMessage.success('删除成功')
    fetchUsers()
  } catch {
  }
}

async function handleSubmit() {
  try {
    if (dialogMode.value === 'create') {
      ElMessage.success('创建用户成功')
    } else {
      ElMessage.success('更新用户成功')
    }
    showDialog.value = false
    fetchUsers()
  } catch (error) {
    console.error('提交失败:', error)
  }
}

function handleSearch() {
  pagination.value.page = 1
  fetchUsers()
}

function handleReset() {
  filters.value = {
    keyword: '',
    role: '',
    status: ''
  }
  pagination.value.page = 1
  fetchUsers()
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="settings-users-page">
    <div class="flex items-center justify-between mb-6">
      <div></div>
      <div class="flex gap-2">
        <button
          class="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text hover:border-accent-500/50 hover:text-accent-400 transition-colors flex items-center gap-2"
          @click="fetchUsers"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
          刷新
        </button>
        <button
          v-if="userStore.hasPermission('user:create')"
          class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
          @click="handleCreate"
        >
          <Plus class="w-4 h-4" />
          新增用户
        </button>
      </div>
    </div>

    <div class="bg-dark-bg rounded-lg p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm text-dark-textSecondary mb-2">关键词搜索</label>
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-textSecondary" />
            <input
              v-model="filters.keyword"
              type="text"
              placeholder="搜索用户名、姓名、邮箱"
              class="w-full pl-10 pr-4 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-dark-text placeholder-dark-textSecondary/50 focus:outline-none focus:border-accent-500/50"
              @keyup.enter="handleSearch"
            />
          </div>
        </div>
        <div>
          <label class="block text-sm text-dark-textSecondary mb-2">角色</label>
          <select
            v-model="filters.role"
            class="w-full px-4 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-dark-text focus:outline-none focus:border-accent-500/50"
          >
            <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-dark-textSecondary mb-2">状态</label>
          <select
            v-model="filters.status"
            class="w-full px-4 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-dark-text focus:outline-none focus:border-accent-500/50"
          >
            <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div class="flex items-end gap-2">
          <button
            class="flex-1 px-4 py-2 bg-dark-border hover:bg-dark-border/80 text-dark-text text-sm rounded-lg transition-colors"
            @click="handleReset"
          >
            重置
          </button>
          <button
            class="flex-1 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm rounded-lg transition-colors"
            @click="handleSearch"
          >
            查询
          </button>
        </div>
      </div>
    </div>

    <el-table
      :data="users"
      v-loading="loading"
      class="dark-table"
      :cell-style="{ color: '#E5E7EB', borderColor: '#374151' }"
      :header-cell-style="{ background: '#1F2937', color: '#9CA3AF', borderColor: '#374151' }"
    >
      <el-table-column prop="username" label="用户名" width="140">
        <template #default="{ row }">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
              <User class="w-4 h-4 text-white" />
            </div>
            <span class="font-medium">{{ row.username }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="姓名" width="120" />
      <el-table-column prop="email" label="邮箱" min-width="180" />
      <el-table-column prop="phone" label="手机号" width="130" />
      <el-table-column label="角色" width="120">
        <template #default="{ row }">
          <span :class="['px-2 py-1 rounded text-xs flex items-center gap-1 w-fit', getRoleClass(row.role)]">
            <Shield class="w-3 h-3" />
            {{ getRoleText(row.role) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <span :class="['flex items-center gap-1', getStatusClass(row.status)]">
            <component :is="row.status === 'active' ? CheckCircle : XCircle" class="w-4 h-4" />
            {{ getStatusText(row.status) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" width="180">
        <template #default="{ row }">
          <span class="text-sm text-dark-textSecondary flex items-center gap-1">
            <Clock class="w-4 h-4" />
            {{ row.lastLogin }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" align="center">
        <template #default="{ row }">
          <div class="flex items-center justify-center gap-2">
            <button
              v-if="userStore.hasPermission('user:update')"
              class="p-1.5 text-accent-400 hover:text-accent-300 hover:bg-accent-500/10 rounded transition-colors"
              @click="handleEdit(row)"
              title="编辑"
            >
              <Edit2 class="w-4 h-4" />
            </button>
            <button
              v-if="userStore.hasPermission('user:delete') && row.id !== 1"
              class="p-1.5 text-danger hover:text-danger/80 hover:bg-danger/10 rounded transition-colors"
              @click="handleDelete(row)"
              title="删除"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div class="flex items-center justify-between mt-4">
      <div class="text-sm text-dark-textSecondary">
        共 {{ total }} 条记录
      </div>
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="prev, pager, next, sizes"
        background
      />
    </div>

    <el-dialog
      v-model="showDialog"
      :title="dialogMode === 'create' ? '新增用户' : '编辑用户'"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="80px"
        class="mt-4"
      >
        <el-form-item label="用户名" prop="username">
          <el-input v-model="formData.username" placeholder="请输入用户名" :disabled="dialogMode === 'edit'" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="formData.password" type="password" placeholder="请输入密码" show-password />
          <span v-if="dialogMode === 'edit'" class="text-xs text-dark-textSecondary">不修改请留空</span>
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="formData.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="formData.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="formData.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="formData.role" class="w-full">
            <el-option
              v-for="opt in roleOptions.filter(o => o.value)"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="formData.status" class="w-full">
            <el-option
              v-for="opt in statusOptions.filter(o => o.value)"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts">
import { ElMessage, ElMessageBox, ElTable, ElTableColumn, ElPagination, ElDialog, ElForm, ElFormItem, ElInput, ElSelect, ElOption } from 'element-plus'

export default {
  components: {
    ElMessage,
    ElMessageBox,
    ElTable,
    ElTableColumn,
    ElPagination,
    ElDialog,
    ElForm,
    ElFormItem,
    ElInput,
    ElSelect,
    ElOption
  }
}
</script>
