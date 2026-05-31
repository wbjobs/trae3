<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">矿井通风系统 3D 可视化</h1>
      </div>

      <div class="header-center">
        <el-button-group>
          <el-button size="small" @click="handleLoadData">
            <span class="btn-icon">📊</span>
            数据加载
          </el-button>
          <el-button size="small" @click="handleResetView">
            <span class="btn-icon">🎯</span>
            重置视角
          </el-button>
          <el-button size="small" @click="handleToggleFullscreen">
            <span class="btn-icon">{{ sceneViewer?.isFullscreen ? '⛶' : '⛶' }}</span>
            {{ sceneViewer?.isFullscreen ? '退出全屏' : '全屏' }}
          </el-button>
          <el-button size="small" @click="showHelp = true">
            <span class="btn-icon">❓</span>
            帮助
          </el-button>
        </el-button-group>
      </div>

      <div class="header-right">
        <el-tag v-if="dataStats" type="success" size="small">
          数据已加载
        </el-tag>
        <el-tag v-else type="info" size="small">
          未加载数据
        </el-tag>
      </div>
    </header>

    <div class="app-body">
      <aside class="sidebar-left">
        <ControlPanel
          :typeLayers="typeLayers"
          :elevationLayers="elevationLayers"
          @setView="handleSetView"
          @resetCamera="handleResetView"
          @setLayerVisibility="handleSetLayerVisibility"
          @setLayerOpacity="handleSetLayerOpacity"
          @showAllLayers="handleShowAllLayers"
          @hideAllLayers="handleHideAllLayers"
          @setBackgroundColor="handleSetBackgroundColor"
          @setFog="handleSetFog"
        />
      </aside>

      <main class="main-content">
        <div class="scene-tabs">
          <div
            class="scene-tab"
            :class="{ active: activeTab === '3d' }"
            @click="activeTab = '3d'"
          >
            3D 视图
          </div>
          <div
            class="scene-tab"
            :class="{ active: activeTab === 'annotations' }"
            @click="activeTab = 'annotations'"
          >
            标注管理
          </div>
        </div>

        <div class="scene-container">
          <SceneViewer
            v-show="activeTab === '3d'"
            ref="sceneViewerRef"
            @ready="handleSceneReady"
            @select="handleObjectSelect"
            @deselect="handleObjectDeselect"
            @doubleClick="handleObjectDoubleClick"
          />

          <div v-show="activeTab === 'annotations'" class="annotation-container">
            <AnnotationPanel
              :annotations="annotationData?.annotations || []"
              :filteredAnnotations="annotationData?.filteredAnnotations || []"
              :isLoading="annotationData?.isLoading || false"
              :filters="annotationData?.filters || {}"
              :stats="annotationData?.stats || { total: 0, filtered: 0 }"
              :editingState="annotationData?.editingState || {}"
              :selectedId="selectedAnnotationId"
              @select="handleAnnotationSelect"
              @delete="handleAnnotationDelete"
              @locate="handleAnnotationLocate"
              @save="handleAnnotationSave"
              @update:filters="handleAnnotationFilterUpdate"
            />
          </div>
        </div>
      </main>

      <aside class="sidebar-right">
        <InfoPanel
          :selectedObject="selectedObject"
          @clearSelection="handleClearSelection"
          @flyTo="handleFlyToObject"
          @loadTunnelDetail="handleLoadTunnelDetail"
        />
      </aside>
    </div>

    <footer class="app-footer">
      <div class="status-item">
        <span class="status-label">坐标:</span>
        <span class="status-value">
          X: {{ sceneStats?.cameraPosition?.x || 0 }},
          Y: {{ sceneStats?.cameraPosition?.y || 0 }},
          Z: {{ sceneStats?.cameraPosition?.z || 0 }}
        </span>
      </div>
      <div class="status-divider"></div>
      <div class="status-item">
        <span class="status-label">帧率:</span>
        <span class="status-value" :class="getFpsClass(sceneStats?.fps)">
          {{ sceneStats?.fps || 0 }} FPS
        </span>
      </div>
      <div class="status-divider"></div>
      <div class="status-item">
        <span class="status-label">对象数:</span>
        <span class="status-value">{{ sceneStats?.objectCount || 0 }}</span>
      </div>
      <div class="status-divider"></div>
      <div class="status-item">
        <span class="status-label">图层:</span>
        <el-tag
          v-for="layer in visibleLayerTags"
          :key="layer.id"
          size="small"
          :type="layer.visible ? 'success' : 'info'"
        >
          {{ layer.name }}
        </el-tag>
      </div>
    </footer>

    <DataLoading
      v-model="showDataLoading"
      :isLoading="dataState?.isLoading || false"
      :isLoaded="dataState?.isLoaded || false"
      :error="dataState?.error || null"
      :progress="dataState?.progress || { loaded: 0, total: 0, type: null }"
      :dataStats="dataStats"
      @load="handleLoadDataRequest"
      @cancel="handleDataLoadingCancel"
    />

    <el-dialog
      v-model="showHelp"
      title="操作帮助"
      width="600px"
    >
      <div class="help-content">
        <h4>鼠标操作</h4>
        <ul>
          <li><strong>左键拖拽:</strong> 旋转视角</li>
          <li><strong>右键拖拽:</strong> 平移视角</li>
          <li><strong>滚轮:</strong> 缩放视角</li>
          <li><strong>Shift + 拖拽:</strong> 框选多个对象</li>
          <li><strong>单击对象:</strong> 选中对象</li>
          <li><strong>双击对象:</strong> 查看详情</li>
          <li><strong>ESC:</strong> 取消选择</li>
        </ul>
        <h4>数据加载</h4>
        <ul>
          <li>点击顶部"数据加载"按钮打开加载对话框</li>
          <li>选择需要加载的数据类型</li>
          <li>勾选"强制刷新"可忽略缓存重新加载</li>
        </ul>
        <h4>图层控制</h4>
        <ul>
          <li>在左侧控制面板可以切换各图层的显示/隐藏</li>
          <li>可以调整图层透明度</li>
          <li>支持按类型和海拔分层控制</li>
        </ul>
        <h4>标注管理</h4>
        <ul>
          <li>切换到"标注管理"标签页查看所有标注</li>
          <li>支持新增、编辑、删除标注</li>
          <li>点击"定位"按钮可快速定位到标注位置</li>
        </ul>
      </div>
      <template #footer>
        <el-button type="primary" @click="showHelp = false">知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, provide } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'
import SceneViewer from './components/SceneViewer.vue'
import ControlPanel from './components/ControlPanel.vue'
import InfoPanel from './components/InfoPanel.vue'
import AnnotationPanel from './components/AnnotationPanel.vue'
import DataLoading from './components/DataLoading.vue'
import { useData, useAnnotation } from './composables'

const sceneViewerRef = ref(null)
const activeTab = ref('3d')
const showDataLoading = ref(false)
const showHelp = ref(false)
const selectedObject = ref(null)
const selectedAnnotationId = ref(null)

const sceneStats = ref({
  fps: 0,
  objectCount: 0,
  cameraPosition: { x: 0, y: 0, z: 0 }
})

const typeLayers = ref([])
const elevationLayers = ref([])

const data = useData()
const { data: dataStore, loadingState: dataState, stats: dataStats, loadAllData, refreshData, getAllThreeObjects, getThreeObjectsByType } = data

const annotationData = ref(null)
let annotationManagerInstance = null
let annotationFunctions = null
const layerControllerRef = ref(null)
const cameraControllerRef = ref(null)

const visibleLayerTags = computed(() => {
  const layers = [...typeLayers.value, ...elevationLayers.value]
  return layers
    .filter((l) => l.objectCount > 0)
    .slice(0, 4)
    .map((l) => ({
      id: l.id,
      name: getLayerDisplayName(l),
      visible: l.visible
    }))
})

const getLayerDisplayName = (layer) => {
  if (layer.type === 'type') {
    const names = {
      tunnel: '巷道',
      pipe: '管道',
      fan: '风机',
      annotation: '标注'
    }
    return names[layer.value] || layer.value
  }
  if (layer.type === 'elevation') {
    return `${layer.value}m`
  }
  return layer.name || layer.id
}

const getFpsClass = (fps) => {
  if (fps >= 50) return 'fps-good'
  if (fps >= 30) return 'fps-medium'
  return 'fps-low'
}

const handleSceneReady = (managers) => {
  const { layerController, annotationManager, cameraController, interactionManager } = managers
  annotationManagerInstance = annotationManager
  layerControllerRef.value = layerController
  cameraControllerRef.value = cameraController

  annotationFunctions = useAnnotation(annotationManager)
  annotationData.value = annotationFunctions
  annotationFunctions.initAnnotations()

  provide('managers', managers)
  provide('layerController', layerController)
  provide('annotationManager', annotationManager)
  provide('cameraController', cameraController)
  provide('interactionManager', interactionManager)

  updateLayerLists()

  ElMessage.success('3D场景初始化成功')
}

const updateLayerLists = () => {
  if (!layerControllerRef.value) return

  typeLayers.value = layerControllerRef.value.getTypeLayers()
  elevationLayers.value = layerControllerRef.value.getElevationLayers()
}

const handleObjectSelect = (event) => {
  const obj = event.object
  if (obj && obj.userData) {
    const userData = obj.userData
    selectedObject.value = {
      type: userData.type,
      data: userData.data,
      object: obj
    }

    if (userData.type === 'annotation') {
      selectedAnnotationId.value = userData.data?.id
    }
  }
}

const handleObjectDeselect = () => {
  selectedObject.value = null
  selectedAnnotationId.value = null
}

const handleObjectDoubleClick = (event) => {
  const obj = event.object
  if (obj && obj.userData?.data) {
    handleFlyToObject({
      type: obj.userData.type,
      data: obj.userData.data,
      object: obj
    })
  }
}

const handleClearSelection = () => {
  const viewer = sceneViewerRef.value
  if (viewer) {
    viewer.clearSelection()
  }
  handleObjectDeselect()
}

const handleFlyToObject = async (objInfo) => {
  const viewer = sceneViewerRef.value
  if (!viewer || !objInfo) return

  let position, target
  const obj = objInfo.object

  if (obj && obj.position) {
    position = {
      x: obj.position.x,
      y: obj.position.y + 20,
      z: obj.position.z + 30
    }
    target = {
      x: obj.position.x,
      y: obj.position.y,
      z: obj.position.z
    }
  } else if (objInfo.data?.position) {
    const pos = objInfo.data.position
    position = {
      x: pos.x,
      y: pos.y + 20,
      z: pos.z + 30
    }
    target = {
      x: pos.x,
      y: pos.y,
      z: pos.z
    }
  } else {
    return
  }

  await viewer.flyTo(position, target, 1000)
}

const handleLoadData = () => {
  showDataLoading.value = true
}

const handleLoadDataRequest = async (options) => {
  try {
    const result = options.forceRefresh
      ? await refreshData(options.types)
      : await loadAllData(options.types)

    const viewer = sceneViewerRef.value
    if (viewer) {
      const allObjects = getAllThreeObjects()

      allObjects.forEach((obj) => {
        viewer.addObject(obj)
        viewer.addObjectsToInteraction(obj)

        const type = obj.userData?.type
        if (type) {
          viewer.addObjectToTypeLayer(obj, type)
        }
      })

      updateLayerLists()
    }

    ElNotification.success({
      title: '数据加载成功',
      message: `加载了 ${dataStats.value.tunnelCount} 条巷道、${dataStats.value.pipeCount} 条管道、${dataStats.value.fanCount} 个风机、${dataStats.value.annotationCount} 个标注`,
      duration: 3000
    })
  } catch (error) {
    console.error('Load data error:', error)
    ElMessage.error('数据加载失败: ' + error.message)
  }
}

const handleDataLoadingCancel = () => {
  showDataLoading.value = false
}

const handleResetView = () => {
  const viewer = sceneViewerRef.value
  if (viewer) {
    viewer.resetCamera()
  }
}

const handleSetView = (viewName) => {
  const viewer = sceneViewerRef.value
  if (viewer) {
    viewer.setView(viewName)
  }
}

const handleToggleFullscreen = () => {
  const viewer = sceneViewerRef.value
  if (viewer) {
    viewer.toggleFullscreen()
  }
}

const handleSetLayerVisibility = (layerId, visible) => {
  const viewer = sceneViewerRef.value
  if (viewer) {
    viewer.setLayerVisibility(layerId, visible)
    updateLayerLists()
  }
}

const handleSetLayerOpacity = (layerId, opacity) => {
  const viewer = sceneViewerRef.value
  if (viewer) {
    viewer.setLayerOpacity(layerId, opacity)
  }
}

const handleShowAllLayers = () => {
  typeLayers.value.forEach((layer) => {
    layer.visible = true
    handleSetLayerVisibility(layer.id, true)
  })
  elevationLayers.value.forEach((layer) => {
    layer.visible = true
    handleSetLayerVisibility(layer.id, true)
  })
}

const handleHideAllLayers = () => {
  typeLayers.value.forEach((layer) => {
    layer.visible = false
    handleSetLayerVisibility(layer.id, false)
  })
  elevationLayers.value.forEach((layer) => {
    layer.visible = false
    handleSetLayerVisibility(layer.id, false)
  })
}

const handleSetBackgroundColor = (color) => {
  const viewer = sceneViewerRef.value
  if (viewer) {
    viewer.setBackgroundColor(color)
  }
}

const handleSetFog = (fogOptions) => {
  const viewer = sceneViewerRef.value
  if (viewer) {
    viewer.setFog(fogOptions.enabled, fogOptions.near, fogOptions.far, fogOptions.color)
  }
}

const handleLoadTunnelDetail = async (tunnelId) => {
  try {
    const result = await data.loadTunnelDetail(tunnelId)
    ElMessage.success(`已加载巷道 ${tunnelId} 的详细数据`)
    return result
  } catch (error) {
    ElMessage.error('加载巷道详情失败')
    throw error
  }
}

const handleAnnotationSelect = (annotation) => {
  selectedAnnotationId.value = annotation.id
  selectedObject.value = {
    type: 'annotation',
    data: annotation.data,
    object: annotation.object3D || annotation.sprite
  }
}

const handleAnnotationDelete = async (annotationId) => {
  if (!annotationFunctions) return

  try {
    await annotationFunctions.deleteAnnotation(annotationId)
    ElMessage.success('标注删除成功')
    updateLayerLists()
  } catch (error) {
    ElMessage.error('删除失败: ' + error.message)
  }
}

const handleAnnotationLocate = (annotation) => {
  handleFlyToObject({
    type: 'annotation',
    data: annotation.data,
    object: annotation.object3D || annotation.sprite
  })
  activeTab.value = '3d'
}

const handleAnnotationSave = async (annoData) => {
  if (!annotationManagerInstance || !annotationFunctions) return

  try {
    if (annoData.id) {
      await annotationFunctions.updateAnnotation(annoData.id, annoData)
      ElMessage.success('标注更新成功')
    } else {
      await annotationFunctions.addAnnotation(annoData)
      await annotationFunctions.refreshAnnotations()
      ElMessage.success('标注创建成功')
    }
    updateLayerLists()
  } catch (error) {
    ElMessage.error('保存失败: ' + error.message)
    throw error
  }
}

const handleAnnotationFilterUpdate = (filters) => {
  if (annotationFunctions) {
    annotationFunctions.setFilters(filters)
  }
}

let statsUpdateInterval = null

onMounted(() => {
  statsUpdateInterval = setInterval(() => {
    const viewer = sceneViewerRef.value
    if (viewer && viewer.stats) {
      sceneStats.value = {
        fps: viewer.stats.fps,
        objectCount: viewer.stats.objectCount,
        cameraPosition: { ...viewer.stats.cameraPosition }
      }
    }
    updateLayerLists()
  }, 500)

  window.addEventListener('resize', handleResize)
})

const handleResize = () => {
  const viewer = sceneViewerRef.value
  if (viewer) {
    viewer.resize()
  }
}

onUnmounted(() => {
  if (statsUpdateInterval) {
    clearInterval(statsUpdateInterval)
  }
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f0f2f5;
}

.app-header {
  height: 56px;
  background: linear-gradient(90deg, #001529 0%, #002140 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
}

.app-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 1px;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 16px;
}

.btn-icon {
  margin-right: 4px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar-left {
  width: 280px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  overflow: hidden;
}

.sidebar-right {
  width: 320px;
  flex-shrink: 0;
  background: #fff;
  border-left: 1px solid #e4e7ed;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.scene-tabs {
  height: 40px;
  display: flex;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;
}

.scene-tab {
  padding: 0 20px;
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 14px;
  color: #606266;
  border-bottom: 2px solid transparent;
  transition: all 0.3s;
}

.scene-tab:hover {
  color: #409eff;
  background: #f5f7fa;
}

.scene-tab.active {
  color: #409eff;
  border-bottom-color: #409eff;
  font-weight: 600;
}

.scene-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.annotation-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app-footer {
  height: 36px;
  background: #fff;
  border-top: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  font-size: 12px;
  flex-shrink: 0;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-label {
  color: #909399;
  font-weight: 500;
}

.status-value {
  color: #303133;
  font-family: 'Consolas', 'Monaco', monospace;
}

.status-divider {
  width: 1px;
  height: 16px;
  background: #e4e7ed;
}

.fps-good {
  color: #67c23a;
}

.fps-medium {
  color: #e6a23c;
}

.fps-low {
  color: #f56c6c;
}

.help-content {
  line-height: 1.8;
}

.help-content h4 {
  margin: 16px 0 8px;
  color: #303133;
  font-size: 14px;
}

.help-content h4:first-child {
  margin-top: 0;
}

.help-content ul {
  margin: 0;
  padding-left: 20px;
}

.help-content li {
  margin-bottom: 4px;
  color: #606266;
}

.help-content strong {
  color: #409eff;
}

:deep(.el-button-group .el-button) {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

:deep(.el-button-group .el-button:hover) {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

:deep(.el-tag) {
  --el-tag-border-color: transparent;
}
</style>
