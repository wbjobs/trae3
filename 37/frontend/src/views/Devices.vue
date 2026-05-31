<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">设备管理</h2>
      <el-button type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon>
        新增设备
      </el-button>
    </div>

    <div class="chart-container">
      <el-table :data="devices" stripe v-loading="loading">
        <el-table-column prop="device_code" label="设备编号" width="150" />
        <el-table-column prop="device_name" label="设备名称" width="150" />
        <el-table-column prop="device_type" label="设备类型" width="120" />
        <el-table-column prop="location" label="安装位置" />
        <el-table-column prop="manufacturer" label="制造商" width="120" />
        <el-table-column prop="model" label="型号" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'running' ? 'success' : 'info'">
              {{ row.status === 'running' ? '运行中' : '停机' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editDevice(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deleteDevice(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="showAddDialog"
      :title="editingDevice ? '编辑设备' : '新增设备'"
      width="600px"
    >
      <el-form :model="formData" label-width="100px">
        <el-form-item label="设备编号">
          <el-input v-model="formData.device_code" />
        </el-form-item>
        <el-form-item label="设备名称">
          <el-input v-model="formData.device_name" />
        </el-form-item>
        <el-form-item label="设备类型">
          <el-select v-model="formData.device_type" style="width: 100%">
            <el-option label="水泵" value="pump" />
            <el-option label="电机" value="motor" />
            <el-option label="风机" value="fan" />
            <el-option label="压缩机" value="compressor" />
          </el-select>
        </el-form-item>
        <el-form-item label="安装位置">
          <el-input v-model="formData.location" />
        </el-form-item>
        <el-form-item label="制造商">
          <el-input v-model="formData.manufacturer" />
        </el-form-item>
        <el-form-item label="型号">
          <el-input v-model="formData.model" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="formData.status" style="width: 100%">
            <el-option label="运行中" value="running" />
            <el-option label="停机" value="stopped" />
            <el-option label="维护中" value="maintenance" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input type="textarea" v-model="formData.description" />
        </el-form-item>
      </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="saveDevice">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deviceApi } from '@/api'

const devices = ref([])
const loading = ref(false)
const showAddDialog = ref(false)
const editingDevice = ref(null)

const formData = reactive({
  device_code: '',
  device_name: '',
  device_type: '',
  location: '',
  manufacturer: '',
  model: '',
  status: 'running',
  description: ''
})

const loadDevices = async () => {
  loading.value = true
  try {
    const data = await deviceApi.getDevices()
    devices.value = data || []
  } catch (error) {
    ElMessage.error('加载设备列表失败')
  } finally {
    loading.value = false
  }
}

const editDevice = (row) => {
  editingDevice.value = row
  Object.assign(formData, row)
  showAddDialog.value = true
}

const deleteDevice = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除该设备吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await deviceApi.deleteDevice(row.id)
    ElMessage.success('删除成功')
    loadDevices()
  } catch {
  }
}

const saveDevice = async () => {
  try {
    if (editingDevice.value) {
      await deviceApi.updateDevice(editingDevice.value.id, formData)
      ElMessage.success('更新成功')
    } else {
      await deviceApi.createDevice(formData)
      ElMessage.success('创建成功')
    }
    showAddDialog.value = false
    resetForm()
    loadDevices()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const resetForm = () => {
  editingDevice.value = null
  Object.assign(formData, {
    device_code: '',
    device_name: '',
    device_type: '',
    location: '',
    manufacturer: '',
    model: '',
    status: 'running',
    description: ''
  })
}

onMounted(() => {
  loadDevices()
})
</script>
