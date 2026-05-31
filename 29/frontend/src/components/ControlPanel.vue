<template>
  <div class="control-panel">
    <el-collapse v-model="activeNames">
      <el-collapse-item title="图层控制" name="layers">
        <div class="layer-control">
          <div class="layer-item">
            <el-checkbox v-model="layerConfig.tunnel" @change="toggleLayer('type_tunnel')">
              <span class="layer-color" style="background: #8B7355"></span>
              巷道
            </el-checkbox>
          </div>
          <div class="layer-item">
            <el-checkbox v-model="layerConfig.pipe" @change="toggleLayer('type_pipe')">
              <span class="layer-color" style="background: #4ECDC4"></span>
              管道
            </el-checkbox>
          </div>
          <div class="layer-item">
            <el-checkbox v-model="layerConfig.fan" @change="toggleLayer('type_fan')">
              <span class="layer-color" style="background: #555555"></span>
              风机
            </el-checkbox>
          </div>
          <div class="layer-item">
            <el-checkbox v-model="layerConfig.annotation" @change="toggleLayer('type_annotation')">
              <span class="layer-color" style="background: #4CAF50"></span>
              标注
            </el-checkbox>
          </div>
        </div>
      </el-collapse-item>

      <el-collapse-item title="层级控制" name="elevation">
        <div class="elevation-control">
          <div class="elevation-item" v-for="elev in elevations" :key="elev">
            <el-checkbox v-model="elevationConfig[elev]" @change="toggleElevation(elev)">
              {{ elev }}m
            </el-checkbox>
          </div>
        </div>
      </el-collapse-item>

      <el-collapse-item title="视角切换" name="views">
        <div class="view-control">
          <el-button-group>
            <el-button :type="currentView === 'top' ? 'primary' : 'default'" @click="setView('top')">
              顶视图
            </el-button>
            <el-button :type="currentView === 'front' ? 'primary' : 'default'" @click="setView('front')">
              前视图
            </el-button>
            <el-button :type="currentView === 'side' ? 'primary' : 'default'" @click="setView('side')">
              侧视图
            </el-button>
            <el-button :type="currentView === 'perspective' ? 'primary' : 'default'" @click="setView('perspective')">
              透视图
            </el-button>
          </el-button-group>
        </div>
      </el-collapse-item>

      <el-collapse-item title="动画控制" name="animation">
        <div class="animation-control">
          <div class="animation-item">
            <span>风机旋转</span>
            <el-switch v-model="animationConfig.fan" @change="toggleFanAnimation" />
          </div>
          <div class="animation-item">
            <span>风流粒子</span>
            <el-switch v-model="animationConfig.particles" @change="toggleParticleAnimation" />
          </div>
          <div class="animation-item">
            <el-button-group>
              <el-button :icon="isPlaying ? 'VideoPause' : 'VideoPlay'" @click="toggleAnimation">
                {{ isPlaying ? '暂停' : '播放' }}
              </el-button>
              <el-button icon="RefreshRight" @click="resetAnimation">
                重置
              </el-button>
            </el-button-group>
          </div>
        </div>
      </el-collapse-item>

      <el-collapse-item title="辅助显示" name="helpers">
        <div class="helper-control">
          <div class="helper-item">
            <el-checkbox v-model="helperConfig.axes" @change="toggleAxes">
              坐标轴
            </el-checkbox>
          </div>
          <div class="helper-item">
            <el-checkbox v-model="helperConfig.grid" @change="toggleGrid">
              网格
            </el-checkbox>
          </div>
          <div class="helper-item">
            <el-checkbox v-model="helperConfig.performanceStats" @change="togglePerformanceStats">
              性能统计
            </el-checkbox>
          </div>
        </div>
      </el-collapse-item>

      <el-collapse-item title="性能模式" name="performance">
        <div class="performance-control">
          <div class="performance-item">
            <span class="performance-label">渲染质量</span>
            <el-radio-group v-model="performanceConfig.mode" @change="handleSetPerformanceMode">
              <el-radio-button value="low">低</el-radio-button>
              <el-radio-button value="medium">中</el-radio-button>
              <el-radio-button value="high">高</el-radio-button>
              <el-radio-button value="ultra">极致</el-radio-button>
            </el-radio-group>
          </div>
          <div class="performance-item">
            <el-checkbox v-model="performanceConfig.useInstancing" @change="toggleInstancing">
              实例化渲染
            </el-checkbox>
          </div>
          <div class="performance-item">
            <el-checkbox v-model="performanceConfig.useLazyLoading" @change="toggleLazyLoading">
              懒加载
            </el-checkbox>
          </div>
          <div class="performance-item">
            <span class="performance-label">加载距离阈值</span>
            <el-slider 
              v-model="performanceConfig.viewDistance" 
              :min="100" 
              :max="1000" 
              :step="50"
              @change="updateViewDistance"
            />
          </div>
          <div class="performance-stats" v-if="helperConfig.performanceStats">
            <div class="stat-row">
              <span>FPS:</span>
              <span class="stat-value" :class="{ warning: fps < 30 }">{{ fps }}</span>
            </div>
            <div class="stat-row">
              <span>对象数:</span>
              <span class="stat-value">{{ objectCount }}</span>
            </div>
            <div class="stat-row">
              <span>Draw Call:</span>
              <span class="stat-value">{{ drawCalls }}</span>
            </div>
            <div class="stat-row">
              <span>实例化:</span>
              <span class="stat-value">{{ instancedCount }}</span>
            </div>
            <div class="stat-row">
              <span>懒加载:</span>
              <span class="stat-value">{{ lazyLoadedCount }}</span>
            </div>
          </div>
        </div>
      </el-collapse-item>

      <el-collapse-item title="截面分析" name="section">
        <div class="section-control">
          <div class="section-item">
            <el-button 
              :type="sectionConfig.enabled ? 'danger' : 'primary'" 
              @click="toggleSectionTool"
              style="width: 100%"
            >
              <el-icon><Scissor /></el-icon>
              {{ sectionConfig.enabled ? '关闭截面工具' : '开启截面工具' }}
            </el-button>
          </div>
          
          <div v-if="sectionConfig.enabled" class="section-options">
            <div class="section-item">
              <span class="section-label">截面方向</span>
              <el-radio-group v-model="sectionConfig.axis" @change="updateSectionAxis">
                <el-radio-button value="x">X轴</el-radio-button>
                <el-radio-button value="y">Y轴</el-radio-button>
                <el-radio-button value="z">Z轴</el-radio-button>
              </el-radio-group>
            </div>
            
            <div class="section-item">
              <span class="section-label">截面位置</span>
              <el-slider 
                v-model="sectionConfig.position" 
                :min="-500" 
                :max="500" 
                :step="1"
                @change="updateSectionPosition"
              />
            </div>
            
            <div class="section-item">
              <el-checkbox v-model="sectionConfig.showFill" @change="updateSectionFill">
                显示填充
              </el-checkbox>
            </div>
            
            <div class="section-item">
              <el-checkbox v-model="sectionConfig.showData" @change="toggleSectionData">
                显示截面数据
              </el-checkbox>
            </div>
            
            <div class="section-item">
              <el-button @click="handleAutoGenerateSections" style="width: 100%">
                <el-icon><List /></el-icon>
                自动生成等间距截面
              </el-button>
            </div>
            
            <div class="section-item">
              <el-button type="success" @click="exportSectionData" style="width: 100%">
                <el-icon><Download /></el-icon>
                导出截面数据
              </el-button>
            </div>

            <div v-if="sectionData" class="section-data">
              <div class="data-title">截面分析数据</div>
              <div class="data-row">
                <span>截面面积:</span>
                <span>{{ sectionData.area?.toFixed(2) || '-' }} m²</span>
              </div>
              <div class="data-row">
                <span>截面周长:</span>
                <span>{{ sectionData.perimeter?.toFixed(2) || '-' }} m</span>
              </div>
              <div class="data-row">
                <span>等效直径:</span>
                <span>{{ sectionData.equivalentDiameter?.toFixed(2) || '-' }} m</span>
              </div>
              <div class="data-row" v-if="sectionData.deformation">
                <span>变形率:</span>
                <span :class="sectionData.deformation > 5 ? 'danger' : 'success'">
                  {{ sectionData.deformation.toFixed(1) }}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </el-collapse-item>

      <el-collapse-item title="批量操作" name="batch">
        <div class="batch-control">
          <div class="batch-item">
            <el-button 
              :type="batchConfig.multiSelect ? 'primary' : 'default'"
              @click="toggleMultiSelect"
              style="width: 100%"
            >
              <el-icon><CircleCheckFilled /></el-icon>
              {{ batchConfig.multiSelect ? '关闭多选模式' : '开启多选模式' }}
            </el-button>
          </div>
          
          <div v-if="batchConfig.multiSelect || selectedCount > 0" class="batch-options">
            <div class="batch-stats">
              已选择 <span class="selected-count">{{ selectedCount }}</span> 个对象
            </div>
            
            <div class="batch-item">
              <el-button @click="selectAll" style="width: 48%">
                <el-icon><RefreshRight /></el-icon>
                全选
              </el-button>
              <el-button @click="handleInvertSelection" style="width: 48%">
                反选
              </el-button>
            </div>
            
            <div class="batch-item">
              <span class="batch-label">对齐方式</span>
              <el-radio-group v-model="batchConfig.alignment" @change="alignSelected">
                <el-radio-button value="left">左</el-radio-button>
                <el-radio-button value="centerH">中</el-radio-button>
                <el-radio-button value="right">右</el-radio-button>
                <el-radio-button value="top">上</el-radio-button>
                <el-radio-button value="centerV">中</el-radio-button>
                <el-radio-button value="bottom">下</el-radio-button>
              </el-radio-group>
            </div>
            
            <div class="batch-item">
              <el-button type="danger" @click="deleteSelected" style="width: 100%">
                <el-icon><Delete /></el-icon>
                批量删除
              </el-button>
            </div>
            
            <div class="batch-item">
              <el-button @click="exportSelected" style="width: 100%">
                <el-icon><Download /></el-icon>
                导出选中
              </el-button>
            </div>
          </div>
          
          <div class="batch-shortcuts">
            <div class="shortcut-title">快捷键</div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>A</kbd> 全选
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>I</kbd> 反选
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + 点击 多选
            </div>
            <div class="shortcut-item">
              <kbd>Shift</kbd> + 拖拽 框选
            </div>
            <div class="shortcut-item">
              <kbd>ESC</kbd> 取消选择
            </div>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup>
import { ref, reactive, inject, onMounted, onBeforeUnmount, computed } from 'vue'
import * as THREE from 'three'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Scissor,
  List,
  Download,
  CircleCheckFilled,
  RefreshRight,
  Delete
} from '@element-plus/icons-vue'

const layerController = inject('layerController')
const cameraController = inject('cameraController')
const animationManager = inject('animationManager')
const sceneManager = inject('sceneManager')
const interactionManager = inject('interactionManager')
const annotationManager = inject('annotationManager')
const lazyLoader = inject('lazyLoader')
const instancedRenderer = inject('instancedRenderer')
const crossSectionTool = inject('crossSectionTool')
const setPerformanceMode = inject('setPerformanceMode')
const enableSectionInteraction = inject('enableSectionInteraction')
const autoGenerateSectionsGlobal = inject('autoGenerateSections')
const calculateSectionDataGlobal = inject('calculateSectionData')
const getSelectedObjects = inject('getSelectedObjects') || (() => [])
const setSelectedObjects = inject('setSelectedObjects') || (() => {})
const invertSelectionGlobal = inject('invertSelection') || (() => {})
const selectAllObjects = inject('selectAllObjects') || (() => {})
const alignAnnotations = inject('alignAnnotations') || (() => {})
const batchDeleteAnnotations = inject('batchDeleteAnnotations') || (() => {})

const activeNames = ref(['layers', 'elevation', 'views', 'animation', 'helpers', 'performance', 'section', 'batch'])

const layerConfig = reactive({
  tunnel: true,
  pipe: true,
  fan: true,
  annotation: true
})

const elevations = [-100, -200, -300, -400, -500]
const elevationConfig = reactive({
  '-100': true,
  '-200': true,
  '-300': true,
  '-400': true,
  '-500': true
})

const currentView = ref('perspective')

const animationConfig = reactive({
  fan: true,
  particles: true
})

const isPlaying = ref(true)

const helperConfig = reactive({
  axes: false,
  grid: false,
  performanceStats: true
})

const performanceConfig = reactive({
  mode: 'medium',
  useInstancing: false,
  useLazyLoading: true,
  viewDistance: 300
})

const sectionConfig = reactive({
  enabled: false,
  axis: 'x',
  position: 0,
  showFill: true,
  showData: true
})

const batchConfig = reactive({
  multiSelect: false,
  alignment: 'left'
})

const sectionData = ref(null)
const currentPlaneId = ref(null)
const fps = ref(60)
const objectCount = ref(0)
const drawCalls = ref(0)
const instancedCount = ref(0)
const lazyLoadedCount = ref(0)
const selectedCount = computed(() => getSelectedObjects().length)

let axesHelper = null
let gridHelper = null
let statsInterval = null

const toggleLayer = (layerId) => {
  if (!layerController) return
  const type = layerId.replace('type_', '')
  if (layerConfig[type]) {
    layerController.showLayer(layerId)
  } else {
    layerController.hideLayer(layerId)
  }
}

const toggleElevation = (elev) => {
  if (!layerController) return
  const layerId = `elevation_${elev}m`
  if (elevationConfig[elev]) {
    layerController.showLayer(layerId)
  } else {
    layerController.hideLayer(layerId)
  }
}

const setView = (viewName) => {
  if (!cameraController) return
  currentView.value = viewName
  cameraController.setView(viewName)
}

const toggleFanAnimation = () => {
  if (!animationManager) return
  if (animationConfig.fan) {
    animationManager.enableAnimation('fan_', true)
  } else {
    animationManager.enableAnimation('fan_', false)
  }
}

const toggleParticleAnimation = () => {
  if (!animationManager) return
  animationManager.particleSystems.forEach((_, key) => {
    animationManager.enableParticleSystem(key, animationConfig.particles)
  })
}

const toggleAnimation = () => {
  if (!animationManager) return
  isPlaying.value = !isPlaying.value
  if (isPlaying.value) {
    animationManager.play()
  } else {
    animationManager.pause()
  }
}

const resetAnimation = () => {
  if (!animationManager) return
  animationManager.stopAllAnimations()
  isPlaying.value = true
  animationManager.play()
}

const toggleAxes = () => {
  if (!sceneManager) return
  if (helperConfig.axes) {
    axesHelper = new THREE.AxesHelper(100)
    sceneManager.add(axesHelper)
  } else if (axesHelper) {
    sceneManager.remove(axesHelper)
    axesHelper = null
  }
}

const toggleGrid = () => {
  if (!sceneManager) return
  if (helperConfig.grid) {
    gridHelper = new THREE.GridHelper(500, 50)
    sceneManager.add(gridHelper)
  } else if (gridHelper) {
    sceneManager.remove(gridHelper)
    gridHelper = null
  }
}

const togglePerformanceStats = () => {
  // 性能统计显示由父组件控制
}

const handleSetPerformanceMode = () => {
  if (setPerformanceMode) {
    setPerformanceMode(performanceConfig.mode)
  }
}

const toggleInstancing = () => {
  if (instancedRenderer) {
    if (performanceConfig.useInstancing) {
      instancedRenderer.rebuild()
    } else {
      instancedRenderer.dispose()
    }
  }
}

const toggleLazyLoading = () => {
  if (lazyLoader) {
    // 懒加载状态切换由 LazyLoader 内部处理
  }
}

const updateViewDistance = () => {
  if (lazyLoader) {
    // 更新懒加载距离阈值
    lazyLoader.options.viewDistance = performanceConfig.viewDistance
  }
}

const toggleSectionTool = () => {
  sectionConfig.enabled = !sectionConfig.enabled
  if (sectionConfig.enabled) {
    createSectionPlane()
    if (enableSectionInteraction) {
      enableSectionInteraction(true)
    }
  } else {
    removeSectionPlane()
    if (enableSectionInteraction) {
      enableSectionInteraction(false)
    }
  }
}

const createSectionPlane = () => {
  if (!crossSectionTool) return
  
  const normals = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1)
  }
  
  currentPlaneId.value = crossSectionTool.createPlane({
    normal: normals[sectionConfig.axis],
    position: new THREE.Vector3(sectionConfig.position, 0, 0),
    color: 0x00ffff
  })
  
  crossSectionTool.addEventListener('sectionCalculated', (event) => {
    if (sectionConfig.showData) {
      sectionData.value = event.sectionData
    }
  })
}

const removeSectionPlane = () => {
  if (crossSectionTool && currentPlaneId.value) {
    crossSectionTool.removePlane(currentPlaneId.value)
    currentPlaneId.value = null
  }
  sectionData.value = null
}

const updateSectionAxis = () => {
  if (!crossSectionTool || !currentPlaneId.value) return
  createSectionPlane()
}

const updateSectionPosition = () => {
  if (!crossSectionTool || !currentPlaneId.value) return
  
  const positions = {
    x: new THREE.Vector3(sectionConfig.position, 0, 0),
    y: new THREE.Vector3(0, sectionConfig.position, 0),
    z: new THREE.Vector3(0, 0, sectionConfig.position)
  }
  
  const normals = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1)
  }
  
  crossSectionTool.updatePlane(
    currentPlaneId.value,
    positions[sectionConfig.axis],
    normals[sectionConfig.axis]
  )
}

const updateSectionFill = () => {
  // 截面填充显示由 CrossSectionTool 内部根据配置处理
}

const toggleSectionData = () => {
  if (!sectionConfig.showData) {
    sectionData.value = null
  }
}

const handleAutoGenerateSections = async () => {
  if (!autoGenerateSectionsGlobal) return
  try {
    const results = await autoGenerateSectionsGlobal(null, 5, sectionConfig.axis)
    ElMessage.success(`已生成 ${results.length} 个截面`)
  } catch (e) {
    ElMessage.error('生成截面失败: ' + e.message)
  }
}

const exportSectionData = () => {
  if (!crossSectionTool) return
  try {
    const data = crossSectionTool.exportSectionData('json')
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `section_data_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('截面数据导出成功')
  } catch (e) {
    ElMessage.error('导出失败: ' + e.message)
  }
}

const toggleMultiSelect = () => {
  batchConfig.multiSelect = !batchConfig.multiSelect
  if (!batchConfig.multiSelect && interactionManager) {
    interactionManager.clearSelection()
  }
}

const selectAll = () => {
  if (selectAllObjects) {
    selectAllObjects()
  }
}

const handleInvertSelection = () => {
  if (invertSelectionGlobal) {
    invertSelectionGlobal()
  }
}

const alignSelected = () => {
  if (alignAnnotations && annotationManager) {
    const selected = annotationManager.getSelectedAnnotations()
    if (selected.length >= 2) {
      alignAnnotations(selected.map(a => a.id), batchConfig.alignment)
      ElMessage.success('对齐完成')
    } else {
      ElMessage.warning('请选择至少2个标注')
    }
  }
}

const deleteSelected = async () => {
  const selected = getSelectedObjects()
  if (selected.length === 0) {
    ElMessage.warning('请先选择要删除的对象')
    return
  }
  
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selected.length} 个对象吗？`,
      '批量删除确认',
      { type: 'warning' }
    )
    
    if (batchDeleteAnnotations) {
      const annoIds = selected.filter(o => o.userData?.annotationId).map(o => o.userData.annotationId)
      if (annoIds.length > 0) {
        await batchDeleteAnnotations(annoIds)
      }
    }
    
    ElMessage.success(`成功删除 ${selected.length} 个对象`)
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败: ' + e.message)
    }
  }
}

const exportSelected = () => {
  const selected = getSelectedObjects()
  if (selected.length === 0) {
    ElMessage.warning('请先选择要导出的对象')
    return
  }
  
  const data = selected.map(o => ({
    id: o.userData?.id,
    type: o.userData?.type,
    position: o.position,
    userData: o.userData
  }))
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `selected_objects_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
  
  ElMessage.success(`已导出 ${selected.length} 个对象`)
}

const updateStats = () => {
  if (sceneManager) {
    const info = sceneManager.renderer?.info
    if (info) {
      drawCalls.value = info.render.calls
    }
  }
  
  if (instancedRenderer) {
    const stats = instancedRenderer.getStats()
    instancedCount.value = stats.instancedCount || 0
  }
  
  if (lazyLoader) {
    const stats = lazyLoader.getStats()
    lazyLoadedCount.value = stats.loadedCount || 0
  }
  
  if (sceneManager?.scene) {
    let count = 0
    sceneManager.scene.traverse(obj => {
      if (obj.isMesh || obj.isGroup) count++
    })
    objectCount.value = count
  }
}

onMounted(() => {
  if (setPerformanceMode) {
    setPerformanceMode(performanceConfig.mode)
  }
  
  statsInterval = setInterval(updateStats, 1000)
})

onBeforeUnmount(() => {
  if (axesHelper) {
    sceneManager?.remove(axesHelper)
  }
  if (gridHelper) {
    sceneManager?.remove(gridHelper)
  }
  if (statsInterval) {
    clearInterval(statsInterval)
  }
  if (crossSectionTool) {
    crossSectionTool.dispose()
  }
})
</script>

<style scoped>
.control-panel {
  width: 280px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.layer-control,
.elevation-control,
.view-control,
.animation-control,
.helper-control {
  padding: 8px 0;
}

.layer-item,
.elevation-item,
.helper-item {
  display: flex;
  align-items: center;
  padding: 6px 4px;
}

.layer-color {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  margin-right: 8px;
  vertical-align: middle;
}

.elevation-control {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
}

.elevation-item {
  padding: 4px;
}

.view-control {
  display: flex;
  justify-content: center;
}

.animation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
}

.animation-item:last-child {
  justify-content: center;
  margin-top: 8px;
}

:deep(.el-collapse-item__header) {
  font-weight: 600;
}

:deep(.el-collapse-item__wrap) {
  border-bottom: none;
}

.performance-control,
.section-control,
.batch-control {
  padding: 8px 0;
}

.performance-item,
.section-item,
.batch-item {
  display: flex;
  align-items: center;
  padding: 8px 4px;
  gap: 8px;
}

.performance-item {
  justify-content: space-between;
  flex-wrap: wrap;
}

.performance-label,
.section-label,
.batch-label {
  font-size: 13px;
  color: #606266;
  flex-shrink: 0;
}

.performance-stats {
  margin-top: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  width: 100%;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.stat-row .stat-value {
  font-weight: 600;
  color: #409eff;
}

.stat-row .stat-value.warning {
  color: #f56c6c;
}

.section-item {
  flex-direction: column;
  align-items: stretch;
}

.section-data {
  margin-top: 12px;
  padding: 12px;
  background: linear-gradient(135deg, #ecf5ff, #d9ecff);
  border-radius: 6px;
  border: 1px solid #b3d8ff;
}

.data-title {
  font-weight: 600;
  color: #409eff;
  margin-bottom: 8px;
  font-size: 14px;
}

.data-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.data-row .danger {
  color: #f56c6c;
  font-weight: 600;
}

.data-row .success {
  color: #67c23a;
  font-weight: 600;
}

.section-options {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.batch-stats {
  padding: 8px 12px;
  background: #ecf5ff;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
}

.selected-count {
  color: #409eff;
  font-weight: 600;
  font-size: 16px;
}

.batch-shortcuts {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.shortcut-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.shortcut-item {
  font-size: 12px;
  color: #606266;
  padding: 2px 0;
}

kbd {
  display: inline-block;
  padding: 1px 6px;
  font-size: 11px;
  line-height: 1.4;
  color: #444d56;
  vertical-align: middle;
  background-color: #fafbfc;
  border: 1px solid #c6cbd1;
  border-bottom-color: #959da5;
  border-radius: 3px;
  box-shadow: inset 0 -1px 0 #959da5;
}
</style>
