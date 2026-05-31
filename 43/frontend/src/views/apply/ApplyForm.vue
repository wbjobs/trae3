<template>
  <div class="apply-form-container">
    <el-card class="form-card">
      <template #header>
        <div class="card-header">
          <span class="title">危化品领用申请</span>
        </div>
      </template>
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
        class="apply-form"
      >
        <el-form-item label="危化品选择" prop="chemicalId">
          <el-select
            v-model="formData.chemicalId"
            placeholder="请选择危化品"
            style="width: 100%"
            @change="handleChemicalChange"
          >
            <el-option
              v-for="item in chemicalList"
              :key="item.id"
              :label="`${item.name} - 库存: ${item.stock} ${item.unit} - 危险等级: ${item.dangerLevel}`"
              :value="item.id"
            >
              <span>{{ item.name }}</span>
              <span style="float: right; color: #8492a6; font-size: 13px">
                库存: {{ item.stock }} {{ item.unit }} | 
                <el-tag :type="getDangerTagType(item.dangerLevel)" size="small">
                  {{ item.dangerLevel }}
                </el-tag>
              </span>
            </el-option>
          </el-select>
        </el-form-item>

        <el-descriptions
          v-if="selectedChemical"
          :column="2"
          border
          class="chemical-info"
        >
          <el-descriptions-item label="CAS号">
            {{ selectedChemical.casNo }}
          </el-descriptions-item>
          <el-descriptions-item label="规格">
            {{ selectedChemical.specification }}
          </el-descriptions-item>
          <el-descriptions-item label="存储条件">
            {{ selectedChemical.storageCondition }}
          </el-descriptions-item>
          <el-descriptions-item label="危险等级">
            <el-tag :type="getDangerTagType(selectedChemical.dangerLevel)">
              {{ selectedChemical.dangerLevel }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <el-form-item label="申请数量" prop="quantity">
          <el-input-number
            v-model="formData.quantity"
            :min="1"
            :max="maxQuantity"
            :precision="2"
            :step="1"
            style="width: 100%"
            @change="validateQuantity"
          />
          <div v-if="selectedChemical" class="quantity-tip">
            库存: {{ selectedChemical.stock }} {{ selectedChemical.unit }}，
            最大限额: {{ selectedChemical.maxLimit }} {{ selectedChemical.unit }}
          </div>
        </el-form-item>

        <el-form-item label="使用用途" prop="purpose">
          <el-input
            v-model="formData.purpose"
            type="textarea"
            :rows="3"
            placeholder="请输入使用用途"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="使用地点" prop="usageLocation">
          <el-input
            v-model="formData.usageLocation"
            placeholder="请输入使用地点"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="紧急联系人" prop="emergencyContact">
          <el-input
            v-model="formData.emergencyContact"
            placeholder="请输入紧急联系人姓名"
            maxlength="50"
          />
        </el-form-item>

        <el-form-item label="紧急联系电话" prop="emergencyPhone">
          <el-input
            v-model="formData.emergencyPhone"
            placeholder="请输入紧急联系电话"
            maxlength="20"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSaveDraft">
            保存草稿
          </el-button>
          <el-button type="success" @click="handleSubmit">
            提交申请
          </el-button>
          <el-button @click="handleReset">
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getChemicalList } from '@/api/chemical'
import { createApplication, submitApplication } from '@/api/application'

const router = useRouter()
const formRef = ref(null)
const chemicalList = ref([])
const selectedChemical = ref(null)
const loading = ref(false)

const formData = reactive({
  chemicalId: null,
  quantity: 1,
  purpose: '',
  usageLocation: '',
  emergencyContact: '',
  emergencyPhone: ''
})

const maxQuantity = computed(() => {
  if (!selectedChemical.value) return 9999
  return Math.min(selectedChemical.value.stock, selectedChemical.value.maxLimit)
})

const validateQuantity = (rule, value, callback) => {
  if (!value || value <= 0) {
    callback(new Error('请输入申请数量'))
  } else if (selectedChemical.value) {
    if (value > selectedChemical.value.stock) {
      callback(new Error(`申请数量不能超过库存 ${selectedChemical.value.stock}`))
    } else if (value > selectedChemical.value.maxLimit) {
      callback(new Error(`申请数量不能超过最大限额 ${selectedChemical.value.maxLimit}`))
    } else {
      callback()
    }
  } else {
    callback()
  }
}

const validatePhone = (rule, value, callback) => {
  const phoneReg = /^1[3-9]\d{9}$/
  if (!value) {
    callback(new Error('请输入紧急联系电话'))
  } else if (!phoneReg.test(value)) {
    callback(new Error('请输入正确的手机号码格式'))
  } else {
    callback()
  }
}

const validateContact = (rule, value, callback) => {
  if (!value) {
    callback(new Error('请输入紧急联系人'))
  } else if (value.length < 2) {
    callback(new Error('联系人姓名至少2个字符'))
  } else {
    callback()
  }
}

const formRules = {
  chemicalId: [
    { required: true, message: '请选择危化品', trigger: 'change' }
  ],
  quantity: [
    { required: true, validator: validateQuantity, trigger: 'change' }
  ],
  purpose: [
    { required: true, message: '请输入使用用途', trigger: 'blur' },
    { min: 5, message: '使用用途至少5个字符', trigger: 'blur' }
  ],
  usageLocation: [
    { required: true, message: '请输入使用地点', trigger: 'blur' }
  ],
  emergencyContact: [
    { validator: validateContact, trigger: 'blur' }
  ],
  emergencyPhone: [
    { validator: validatePhone, trigger: 'blur' }
  ]
}

const getDangerTagType = (level) => {
  const typeMap = {
    '剧毒': 'danger',
    '高毒': 'danger',
    '中毒': 'warning',
    '低毒': 'warning',
    '微毒': 'success',
    '易燃': 'danger',
    '易爆': 'danger',
    '腐蚀性': 'warning',
    '氧化性': 'warning',
    '一般': 'info'
  }
  return typeMap[level] || 'info'
}

const handleChemicalChange = async (id) => {
  if (!id) {
    selectedChemical.value = null
    return
  }
  selectedChemical.value = chemicalList.value.find(item => item.id === id)
  formData.quantity = 1
}

const handleSaveDraft = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        loading.value = true
        const res = await createApplication({
          ...formData,
          status: 'draft'
        })
        ElMessage.success('草稿保存成功')
        router.push('/apply/my')
      } catch (error) {
        console.error('保存草稿失败:', error)
      } finally {
        loading.value = false
      }
    }
  })
}

const handleSubmit = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        await ElMessageBox.confirm(
          '提交后将进入审批流程，确认要提交申请吗？',
          '提交确认',
          {
            confirmButtonText: '确认提交',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        loading.value = true
        const res = await createApplication({
          ...formData,
          status: 'pending'
        })
        
        if (res.id) {
          await submitApplication(res.id)
        }
        
        ElMessage.success('申请提交成功')
        router.push('/apply/my')
      } catch (error) {
        if (error !== 'cancel') {
          console.error('提交申请失败:', error)
        }
      } finally {
        loading.value = false
      }
    }
  })
}

const handleReset = () => {
  formRef.value?.resetFields()
  selectedChemical.value = null
}

const chemicalListCache = ref(null)
const cacheExpireTime = ref(0)

const fetchChemicalList = async () => {
  const now = Date.now()
  if (chemicalListCache.value && now < cacheExpireTime.value) {
    chemicalList.value = chemicalListCache.value
    return
  }
  
  try {
    loading.value = true
    const res = await getChemicalList({ status: 'active' })
    chemicalList.value = res.list || res
    chemicalListCache.value = res.list || res
    cacheExpireTime.value = now + 5 * 60 * 1000
  } catch (error) {
    console.error('获取危化品列表失败:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchChemicalList()
})
</script>

<style scoped>
.apply-form-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.form-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.apply-form {
  padding-top: 20px;
}

.chemical-info {
  margin-bottom: 20px;
}

.quantity-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}
</style>
