<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { listUsersApi, createUserApi, updateUserApi, deleteUserApi } from '@/utils/api'
import { UserPlus, Trash2, Shield, User } from 'lucide-vue-next'

const users = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const showAddModal = ref(false)
const newUsername = ref('')
const newPassword = ref('')
const newRole = ref<'admin' | 'user'>('user')

async function fetchUsers() {
  loading.value = true
  try {
    const res = await listUsersApi(page.value)
    users.value = res.items
    total.value = res.total
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function handleAddUser() {
  if (!newUsername.value || !newPassword.value) return
  try {
    await createUserApi(newUsername.value, newPassword.value, newRole.value)
    showAddModal.value = false
    newUsername.value = ''
    newPassword.value = ''
    newRole.value = 'user'
    fetchUsers()
  } catch (e: any) {
    alert(e.message)
  }
}

async function toggleUserActive(user: any) {
  try {
    await updateUserApi(user.id, { is_active: !user.is_active })
    fetchUsers()
  } catch (e: any) {
    alert(e.message)
  }
}

async function handleDelete(userId: string) {
  if (!confirm('确定删除该用户？')) return
  try {
    await deleteUserApi(userId)
    fetchUsers()
  } catch (e: any) {
    alert(e.message)
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

onMounted(fetchUsers)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <p class="text-sm text-slate-400">共 {{ total }} 个用户</p>
      <button @click="showAddModal = true" class="btn-primary flex items-center gap-2">
        <UserPlus class="w-4 h-4" />
        添加用户
      </button>
    </div>

    <div class="card overflow-hidden p-0">
      <table class="w-full">
        <thead>
          <tr class="border-b border-slate-700/50 bg-slate-800/50">
            <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">用户名</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">角色</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">状态</th>
            <th class="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">创建时间</th>
            <th class="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="text-center py-8 text-slate-400">加载中...</td>
          </tr>
          <tr
            v-for="u in users"
            :key="u.id"
            class="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                  <User class="w-4 h-4 text-slate-400" />
                </div>
                <span class="text-sm text-slate-200">{{ u.username }}</span>
              </div>
            </td>
            <td class="px-4 py-3">
              <span :class="u.role === 'admin' ? 'badge-info' : 'badge-success'">
                <component :is="u.role === 'admin' ? Shield : User" class="w-3 h-3 inline mr-1" />
                {{ u.role === 'admin' ? '管理员' : '普通用户' }}
              </span>
            </td>
            <td class="px-4 py-3">
              <button
                @click="toggleUserActive(u)"
                :class="[
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  u.is_active
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20',
                ]"
              >
                {{ u.is_active ? '启用' : '禁用' }}
              </button>
            </td>
            <td class="px-4 py-3 text-sm text-slate-500">{{ formatDate(u.created_at) }}</td>
            <td class="px-4 py-3 text-right">
              <button
                @click="handleDelete(u.id)"
                class="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                :disabled="u.username === 'admin'"
                :title="u.username === 'admin' ? '不能删除默认管理员' : '删除'"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showAddModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showAddModal = false">
      <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h3 class="text-lg font-semibold text-white mb-4">添加用户</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-400 mb-1">用户名</label>
            <input v-model="newUsername" class="input-field" placeholder="请输入用户名" />
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">密码</label>
            <input v-model="newPassword" type="password" class="input-field" placeholder="请输入密码" />
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">角色</label>
            <select v-model="newRole" class="input-field">
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button @click="showAddModal = false" class="btn-secondary">取消</button>
          <button @click="handleAddUser" class="btn-primary">确认添加</button>
        </div>
      </div>
    </div>
  </div>
</template>
