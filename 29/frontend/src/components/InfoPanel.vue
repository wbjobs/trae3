<template>
  <div class="info-panel" :class="{ collapsed: isCollapsed }">
    <div class="panel-header" @click="toggleCollapse">
      <span class="panel-title">
        <el-icon><InfoFilled /></el-icon>
        {{ selectedObject ? '对象信息' : '系统概览' }}
      </span>
      <el-icon class="collapse-icon">
        <ArrowRight v-if="isCollapsed" />
        <ArrowLeft v-else />
      </el-icon>
    </div>

    <div class="panel-content" v-show="!isCollapsed">
      <div v-if="selectedObject" class="object-info">
        <div class="info-header">
          <el-tag :type="getObjectTypeTag(objectType)" size="large">
            {{ getObjectTypeName(objectType) }}
          </el-tag>
          <span class="object-name">{{ objectName }}</span>
        </div>

        <el-descriptions :column="1" border size="small" class="info-descriptions">
          <template v-if="objectType === 'tunnel'">
            <el-descriptions-item label="巷道编号">
              {{ objectData?.id || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="巷道名称">
              {{ objectData?.name || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="宽度">
              {{ objectData?.width ? `${objectData.width} m` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="高度">
              {{ objectData?.height ? `${objectData.height} m` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="长度">
              {{ objectData?.length ? `${objectData.length} m` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="断面积">
              {{ objectData?.sectionArea ? `${objectData.sectionArea} m²` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="风量">
              {{ objectData?.airflow ? `${objectData.airflow} m³/s` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="风速">
              {{ objectData?.windSpeed ? `${objectData.windSpeed} m/s` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="风压">
              {{ objectData?.pressure ? `${objectData.pressure} Pa` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="标高">
              {{ objectData?.elevation ? `${objectData.elevation} m` : '-' }}
            </el-descriptions-item>
          </template>

          <template v-else-if="objectType === 'pipe'">
            <el-descriptions-item label="管道编号">
              {{ objectData?.id || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="管道名称">
              {{ objectData?.name || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="管道类型">
              <el-tag :type="objectData?.type === 'air_return' ? 'danger' : 'success'">
                {{ objectData?.type === 'air_return' ? '回风' : '送风' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="直径">
              {{ objectData?.diameter ? `${objectData.diameter} m` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="长度">
              {{ objectData?.length ? `${objectData.length} m` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="材质">
              {{ objectData?.material || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="风压">
              {{ objectData?.pressure ? `${objectData.pressure} Pa` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="流量">
              {{ objectData?.flowRate ? `${objectData.flowRate} m³/s` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="风速">
              {{ objectData?.windSpeed ? `${objectData.windSpeed} m/s` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="温度">
              {{ objectData?.temperature ? `${objectData.temperature} °C` : '-' }}
            </el-descriptions-item>
          </template>

          <template v-else-if="objectType === 'fan'">
            <el-descriptions-item label="风机编号">
              {{ objectData?.id || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="风机名称">
              {{ objectData?.name || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="风机型号">
              {{ objectData?.model || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="运行状态">
              <el-tag :type="objectData?.status === 'running' ? 'success' : 'info'">
                {{ objectData?.status === 'running' ? '运行中' : '待机' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="功率">
              {{ objectData?.power ? `${objectData.power} kW` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="转速">
              {{ objectData?.speed ? `${objectData.speed} rpm` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="叶轮直径">
              {{ objectData?.impellerDiameter ? `${objectData.impellerDiameter} m` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="叶片数">
              {{ objectData?.bladeNumber || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="风量">
              {{ objectData?.airflow ? `${objectData.airflow} m³/s` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="风压">
              {{ objectData?.pressure ? `${objectData.pressure} Pa` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="效率">
              {{ objectData?.efficiency ? `${objectData.efficiency} %` : '-' }}
            </el-descriptions-item>
          </template>

          <template v-else-if="objectType === 'annotation'">
            <el-descriptions-item label="标注编号">
              {{ objectData?.id || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="标注类型">
              {{ getAnnotationTypeName(objectData?.type) }}
            </el-descriptions-item>
            <el-descriptions-item label="标注标题">
              {{ objectData?.title || objectData?.name || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="标注内容">
              {{ objectData?.content || objectData?.description || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="getStatusTag(objectData?.status)">
                {{ getStatusName(objectData?.status) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="优先级">
              {{ objectData?.priority || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">
              {{ objectData?.createdAt || '-' }}
            </el-descriptions-item>
          </template>

          <template v-else>
            <el-descriptions-item label="对象名称">
              {{ objectName }}
            </el-descriptions-item>
            <el-descriptions-item label="对象类型">
              {{ objectType }}
            </el-descriptions-item>
          </template>
        </el-descriptions>

        <div class="info-footer">
          <el-button size="small" @click="clearSelection">取消选中</el-button>
          <el-button size="small" type="primary" @click="focusObject">定位对象</el-button>
        </div>
      </div>

      <div v-else class="system-overview">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="系统名称">
            矿井通风系统 3D 可视化
          </el-descriptions-item>
          <el-descriptions-item label="当前图层">
            <div class="layer-stat">
              <span class="stat-item"><span class="stat-color" style="background: #8B7355"></span>巷道: {{ stats.tunnels }}</span>
              <span class="stat-item"><span class="stat-color" style="background: #4ECDC4"></span>管道: {{ stats.pipes }}</span>
              <span class="stat-item"><span class="stat-color" style="background: #555555"></span>风机: {{ stats.fans }}</span>
              <span class="stat-item"><span class="stat-color" style="background: #4CAF50"></span>标注: {{ stats.annotations }}</span>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="运行状态">
            <el-tag type="success">正常运行</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="当前视角">
            {{ getCurrentViewName() }}
          </el-descriptions-item>
          <el-descriptions-item label="动画状态">
            <el-tag :type="animationState === 'playing' ? 'success' : 'warning'">
              {{ animationState === 'playing' ? '播放中' : '已暂停' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <div class="system-tips">
          <div class="tips-title">操作提示</div>
          <ul class="tips-list">
            <li>左键点击：选择对象</li>
            <li>左键拖动：旋转视角</li>
            <li>右键拖动：平移视角</li>
            <li>滚轮：缩放视角</li>
            <li>Shift + 拖动：框选对象</li>
            <li>ESC：取消选中</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, inject, onMounted, onBeforeUnmount, computed } from 'vue'
import { InfoFilled, ArrowRight, ArrowLeft } from '@element-plus/icons-vue'
import * as THREE from 'three'

const interactionManager = inject('interactionManager')
const cameraController = inject('cameraController')
const animationManager = inject('animationManager')
const sceneManager = inject('sceneManager')
const dataLoader = inject('dataLoader')

const isCollapsed = ref(false)
const selectedObject = ref(null)
const stats = ref({
  tunnels: 0,
  pipes: 0,
  fans: 0,
  annotations: 0
})

const objectType = computed(() => selectedObject.value?.userData?.type || '')
const objectData = computed(() => selectedObject.value?.userData?.data || {})
const objectName = computed(() => selectedObject.value?.name || selectedObject.value?.userData?.data?.name || '未知对象')

const animationState = computed(() => {
  return animationManager?.isPaused ? 'paused' : 'playing'
})

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const getObjectTypeTag = (type) => {
  const tags = {
    tunnel: 'warning',
    pipe: 'success',
    fan: 'info',
    annotation: 'primary'
  }
  return tags[type] || 'info'
}

const getObjectTypeName = (type) => {
  const names = {
    tunnel: '巷道',
    pipe: '管道',
    fan: '风机',
    annotation: '标注'
  }
  return names[type] || '未知'
}

const getAnnotationTypeName = (type) => {
  const names = {
    monitoring_point: '监测点',
    safety: '安全警示',
    defect: '缺陷标注',
    text: '文本标注'
  }
  return names[type] || '其他'
}

const getStatusTag = (status) => {
  const tags = {
    normal: 'success',
    warning: 'warning',
    alarm: 'danger',
    standby: 'info'
  }
  return tags[status] || 'info'
}

const getStatusName = (status) => {
  const names = {
    normal: '正常',
    warning: '警告',
    alarm: '告警',
    standby: '待机'
  }
  return names[status] || '未知'
}

const getCurrentViewName = () => {
  const names = {
    top: '顶视图',
    front: '前视图',
    side: '侧视图',
    perspective: '透视图'
  }
  return names[cameraController?.currentView] || '自定义'
}

const clearSelection = () => {
  if (interactionManager) {
    interactionManager._clearSelection()
  }
  selectedObject.value = null
}

const focusObject = () => {
  if (!selectedObject.value || !cameraController) return
  
  const box = new THREE.Box3().setFromObject(selectedObject.value)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  
  const cameraPos = center.clone().add(new THREE.Vector3(maxDim, maxDim, maxDim))
  cameraController.flyTo(cameraPos, center)
}

const handleSelect = (event) => {
  selectedObject.value = event.object
}

const handleDeselect = () => {
  selectedObject.value = null
}

const updateStats = () => {
  if (!dataLoader) return
  
  const tunnelData = dataLoader.getFromCache('all_tunnels')
  const pipeData = dataLoader.getFromCache('all_pipes')
  const fanData = dataLoader.getFromCache('all_fans')
  const annotationData = dataLoader.getFromCache('all_annotations')
  
  stats.value = {
    tunnels: tunnelData?.three?.length || 0,
    pipes: pipeData?.three?.length || 0,
    fans: fanData?.three?.length || 0,
    annotations: annotationData?.three?.length || 0
  }
}

onMounted(() => {
  if (interactionManager) {
    interactionManager.addEventListener('select', handleSelect)
    interactionManager.addEventListener('deselect', handleDeselect)
  }
  updateStats()
})

onBeforeUnmount(() => {
  if (interactionManager) {
    interactionManager.removeEventListener('select', handleSelect)
    interactionManager.removeEventListener('deselect', handleDeselect)
  }
})
</script>

<style scoped>
.info-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 320px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: all 0.3s ease;
  z-index: 100;
}

.info-panel.collapsed {
  width: auto;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, #409eff, #337ecc);
  color: white;
  cursor: pointer;
  user-select: none;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.collapse-icon {
  font-size: 16px;
  transition: transform 0.3s;
}

.panel-content {
  padding: 16px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.object-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.info-descriptions {
  margin-bottom: 16px;
}

.info-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.layer-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.stat-color {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.system-tips {
  margin-top: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.tips-title {
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
}

.tips-list {
  margin: 0;
  padding-left: 20px;
  color: #909399;
  font-size: 13px;
}

.tips-list li {
  padding: 2px 0;
}

:deep(.el-descriptions__label) {
  width: 100px;
  background: #fafafa;
}
</style>
