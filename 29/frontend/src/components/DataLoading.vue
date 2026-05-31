<template>
  <Transition name="fade">
    <div v-if="visible" class="data-loading-overlay">
      <div class="loading-content">
        <div class="loading-header">
          <el-icon class="loading-icon"><Loading /></el-icon>
          <h3 class="loading-title">正在加载数据...</h3>
        </div>

        <div class="loading-progress">
          <div class="progress-info">
            <span class="current-type">{{ currentTypeText }}</span>
            <span class="progress-percent">{{ progress }}%</span>
          </div>
          <el-progress
            :percentage="progress"
            :status="hasError ? 'exception' : undefined"
            :stroke-width="8"
            :show-text="false"
          />
        </div>

        <div class="loading-steps">
          <div
            v-for="step in loadSteps"
            :key="step.key"
            class="step-item"
            :class="{
              'step-success': step.status === 'success',
              'step-loading': step.status === 'loading',
              'step-error': step.status === 'error',
              'step-pending': step.status === 'pending'
            }"
          >
            <div class="step-icon">
              <el-icon v-if="step.status === 'success'"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="step.status === 'error'"><CircleCloseFilled /></el-icon>
              <el-icon v-else-if="step.status === 'loading'"><Loading /></el-icon>
              <el-icon v-else><Clock /></el-icon>
            </div>
            <span class="step-text">{{ step.label }}</span>
          </div>
        </div>

        <div v-if="hasError" class="error-section">
          <el-alert
            :title="errorMessage"
            type="error"
            :closable="false"
            show-icon
          />
          <div class="error-actions">
            <el-button type="primary" @click="retry">
              <el-icon><RefreshRight /></el-icon>
              重试
            </el-button>
            <el-button @click="cancel">
              取消
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, reactive, inject, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Loading,
  CircleCheckFilled,
  CircleCloseFilled,
  Clock,
  RefreshRight
} from '@element-plus/icons-vue'

const props = defineProps({
  autoLoad: {
    type: Boolean,
    default: true
  },
  loadTypes: {
    type: Array,
    default: () => ['tunnels', 'pipes', 'fans', 'annotations']
  }
})

const emit = defineEmits(['complete', 'error', 'cancel'])

const dataLoader = inject('dataLoader')
const layerController = inject('layerController')
const interactionManager = inject('interactionManager')
const sceneManager = inject('sceneManager')
const animationManager = inject('animationManager')

const visible = ref(false)
const progress = ref(0)
const currentType = ref(null)
const hasError = ref(false)
const errorMessage = ref('')
const isCancelled = ref(false)

const loadSteps = reactive([
  { key: 'tunnels', label: '巷道数据', status: 'pending' },
  { key: 'pipes', label: '管道数据', status: 'pending' },
  { key: 'fans', label: '风机数据', status: 'pending' },
  { key: 'annotations', label: '标注数据', status: 'pending' }
])

const typeLabels = {
  tunnels: '巷道数据',
  pipes: '管道数据',
  fans: '风机数据',
  annotations: '标注数据'
}

const currentTypeText = computed(() => {
  if (hasError.value) return '加载失败'
  if (currentType.value) return `正在加载 ${typeLabels[currentType.value] || currentType.value}`
  if (progress.value >= 100) return '加载完成'
  return '准备加载...'
})

const setStepStatus = (key, status) => {
  const step = loadSteps.find(s => s.key === key)
  if (step) {
    step.status = status
  }
}

const handleProgress = (info) => {
  if (isCancelled.value) return
  
  currentType.value = info.type
  progress.value = Math.round((info.loaded / info.total) * 100)
  setStepStatus(info.type, 'loading')
}

const loadData = async () => {
  if (!dataLoader) return
  
  visible.value = true
  hasError.value = false
  errorMessage.value = ''
  progress.value = 0
  currentType.value = null
  isCancelled.value = false
  
  loadSteps.forEach(step => {
    if (props.loadTypes.includes(step.key)) {
      step.status = 'pending'
    } else {
      step.status = 'success'
    }
  })
  
  try {
    const results = await dataLoader.loadAll(props.loadTypes, handleProgress)
    
    for (const type of props.loadTypes) {
      if (isCancelled.value) break
      
      const result = results[type]
      if (result && result.three) {
        result.three.forEach(obj => {
          if (sceneManager) {
            sceneManager.add(obj)
          }
          if (interactionManager) {
            interactionManager.addObjects(obj)
          }
          if (layerController) {
            const objectType = obj.userData?.type
            if (objectType) {
              layerController.addObjectToTypeLayer(obj, objectType)
            }
            const elevation = obj.userData?.data?.elevation
            if (elevation !== undefined && elevation !== null) {
              const elev = Math.round(elevation / 100) * 100
              if (elev >= -500 && elev <= -100) {
                layerController.addObjectToElevationLayer(obj, elev)
              }
            }
          }
          
          if (type === 'fans' && animationManager) {
            const fanData = obj.userData?.data
            if (fanData?.status === 'running') {
              animationManager.startFanRotation(obj, {
                speed: (fanData.speed || 1000) * Math.PI / 30
              })
            }
          }
          
          if (type === 'pipes' && animationManager) {
            animationManager.createFlowParticles(obj, {
              color: obj.userData?.data?.type === 'air_return' ? 0xFF6B6B : 0x4ECDC4
            })
          }
        })
        setStepStatus(type, 'success')
      } else {
        setStepStatus(type, 'success')
      }
    }
    
    if (!isCancelled.value) {
      progress.value = 100
      currentType.value = null
      
      setTimeout(() => {
        visible.value = false
        emit('complete', results)
        ElMessage.success('数据加载完成')
      }, 500)
    }
  } catch (error) {
    hasError.value = true
    errorMessage.value = error.message || '数据加载失败'
    if (currentType.value) {
      setStepStatus(currentType.value, 'error')
    }
    emit('error', error)
  }
}

const retry = () => {
  loadData()
}

const cancel = () => {
  isCancelled.value = true
  visible.value = false
  emit('cancel')
}

const startLoading = () => {
  loadData()
}

defineExpose({
  startLoading
})

onMounted(() => {
  if (props.autoLoad) {
    loadData()
  }
})
</script>

<style scoped>
.data-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.loading-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.loading-header {
  text-align: center;
  margin-bottom: 24px;
}

.loading-icon {
  font-size: 48px;
  color: #409eff;
  animation: spin 1s linear infinite;
}

.loading-title {
  margin: 16px 0 0 0;
  color: #303133;
  font-size: 18px;
  font-weight: 600;
}

.loading-progress {
  margin-bottom: 24px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.current-type {
  font-size: 14px;
  color: #606266;
}

.progress-percent {
  font-size: 14px;
  font-weight: 600;
  color: #409eff;
}

.loading-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #f5f7fa;
  transition: all 0.3s;
}

.step-item.step-loading {
  background: #ecf5ff;
}

.step-item.step-loading .step-icon {
  color: #409eff;
  animation: spin 1s linear infinite;
}

.step-item.step-success {
  background: #f0f9eb;
}

.step-item.step-success .step-icon {
  color: #67c23a;
}

.step-item.step-error {
  background: #fef0f0;
}

.step-item.step-error .step-icon {
  color: #f56c6c;
}

.step-item.step-pending .step-icon {
  color: #c0c4cc;
}

.step-icon {
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-text {
  font-size: 14px;
  color: #606266;
}

.error-section {
  margin-top: 20px;
}

.error-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
