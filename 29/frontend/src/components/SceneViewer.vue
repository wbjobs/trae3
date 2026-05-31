<template>
  <div ref="containerRef" class="scene-viewer">
    <div v-if="!isReady" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>场景加载中...</span>
    </div>
    <div class="performance-info" v-if="isReady && showStats">
      <div class="stat-item">
        <span class="stat-label">FPS</span>
        <span class="stat-value" :class="{ low: stats.fps < 30 }">{{ stats.fps }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">对象</span>
        <span class="stat-value">{{ stats.objectCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Draw Call</span>
        <span class="stat-value">{{ stats.drawCalls }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">实例化</span>
        <span class="stat-value">{{ stats.instancedCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">懒加载</span>
        <span class="stat-value">{{ stats.lazyLoadedCount }}</span>
      </div>
    </div>
    <div ref="labelContainer" class="label-container"></div>
    <slot></slot>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, provide, inject } from 'vue'
import * as THREE from 'three'
import { useScene } from '../composables/useScene'
import { useData } from '../composables/useData'
import { ObjectFactory } from '../core/ObjectFactory'
import { RenderLayer } from '../core/RenderLayer'

const props = defineProps({
  autoLoad: { type: Boolean, default: true },
  useLazyLoading: { type: Boolean, default: true },
  useInstancing: { type: Boolean, default: false },
  showStats: { type: Boolean, default: true }
})

const emit = defineEmits(['ready', 'load-start', 'load-progress', 'load-complete', 'load-error', 'object-selected', 'object-deselected', 'object-hover', 'batch-select', 'section-calculated'])

const scene = useScene()
const {
  containerRef,
  isReady,
  isFullscreen,
  currentView,
  stats,
  initScene,
  dispose,
  clearScene,
  resize,
  addObject,
  removeObject,
  addObjectsToInteraction,
  addObjectToLayer,
  addObjectToTypeLayer,
  addObjectToLazyLoader,
  addObjectsToLazyLoaderByLayer,
  registerObjectForInstancing,
  registerObjectsForInstancing,
  rebuildInstancing,
  setView,
  resetCamera,
  flyTo,
  setLayerVisibility,
  toggleLayer,
  setLayerOpacity,
  isolateLayer,
  exitIsolation,
  getAllLayers,
  getTypeLayers,
  getElevationLayers,
  preloadLayer,
  unloadLayer,
  setActiveLayers,
  toggleFullscreen,
  on,
  onSelect,
  onDeselect,
  onHover,
  onHoverOut,
  onDoubleClick,
  onBoxSelect,
  onBatchSelect,
  onBatchDeselect,
  getSelected,
  clearSelection,
  getSelectedObjects,
  setSelectedObjects,
  invertSelection,
  selectAllObjects,
  setBackgroundColor,
  setFog,
  setPerformanceMode,
  createCrossSection,
  removeCrossSection,
  updateCrossSection,
  registerObjectForSection,
  intersectObjectWithSection,
  calculateSectionData,
  enableSectionInteraction,
  autoGenerateSections,
  selectAnnotation,
  batchDeleteAnnotations,
  batchUpdateAnnotations,
  batchMoveAnnotations,
  alignAnnotations,
  getSelectedAnnotations,
  clearAnnotationSelection,
  getSceneManager,
  getCameraController,
  getInteractionManager,
  getLayerController,
  getAnnotationManager,
  getLazyLoader,
  getInstancedRenderer,
  getCrossSectionTool,
  getManagers
} = scene

const { loadAllData, loading: dataLoading, progress: dataProgress, loadAnnotations } = useData()

const labelContainer = ref(null)
const loading = ref(false)
const error = ref(null)
const objectsByType = ref({ tunnels: [], pipes: [], fans: [], annotations: [] })
const selectedObject = ref(null)
const selectedObjects = ref([])

const handleKeyDown = (e) => {
  if (e.ctrlKey && e.key === 'a') {
    e.preventDefault()
    selectAllObjects()
  } else if (e.ctrlKey && e.key === 'i') {
    e.preventDefault()
    invertSelection()
  } else if (e.key === 'Escape') {
    clearSelection()
    clearAnnotationSelection()
    selectedObject.value = null
    selectedObjects.value = []
  }
}

const handleSceneReady = (managers) => {
  const { sceneManager, cameraController, interactionManager, layerController, annotationManager, lazyLoader, instancedRenderer, crossSectionTool } = managers

  if (annotationManager && labelContainer.value) {
    annotationManager.setContainer(labelContainer.value)
  }

  provide('sceneManager', sceneManager)
  provide('cameraController', cameraController)
  provide('interactionManager', interactionManager)
  provide('layerController', layerController)
  provide('annotationManager', annotationManager)
  provide('lazyLoader', lazyLoader)
  provide('instancedRenderer', instancedRenderer)
  provide('crossSectionTool', crossSectionTool)
  provide('setView', setView)
  provide('resetCamera', resetCamera)
  provide('flyTo', flyTo)
  provide('toggleFullscreen', toggleFullscreen)
  provide('setPerformanceMode', setPerformanceMode)
  provide('createCrossSection', createCrossSection)
  provide('removeCrossSection', removeCrossSection)
  provide('enableSectionInteraction', enableSectionInteraction)
  provide('autoGenerateSections', autoGenerateSections)
  provide('calculateSectionData', calculateSectionData)

  emit('ready', managers)
}

const init = async () => {
  try {
    loading.value = true
    error.value = null
    emit('load-start')

    const managers = await initScene({
      onReady: handleSceneReady
    })

    onSelect((event) => {
      selectedObject.value = event.object
      emit('object-selected', event)
    })

    onDeselect((event) => {
      selectedObject.value = null
      emit('object-deselected', event)
    })

    onHover((event) => {
      emit('object-hover', event)
    })

    onBatchSelect((event) => {
      selectedObjects.value = event.objects || []
      emit('batch-select', event)
    })

    onBatchDeselect(() => {
      selectedObjects.value = []
    })

    const crossSectionTool = getCrossSectionTool()
    if (crossSectionTool) {
      crossSectionTool.addEventListener('sectionCalculated', (event) => {
        emit('section-calculated', event)
      })
    }

    if (props.autoLoad) {
      await loadAllData()
      await loadAnnotations()
      await createSceneObjects()
    }

    window.addEventListener('keydown', handleKeyDown)
  } catch (e) {
    console.error('Scene initialization failed:', e)
    error.value = e.message
    emit('load-error', e)
  } finally {
    loading.value = false
  }
}

const createSceneObjects = async () => {
  const { tunnels, pipes, fans, annotations: apiAnnotations } = useData()
  const lazyLoader = getLazyLoader()
  const instancedRenderer = getInstancedRenderer()
  const crossSectionTool = getCrossSectionTool()

  const tunnelLayer = new RenderLayer('tunnels', 0x4a4a4a)
  const pipeLayer = new RenderLayer('pipes', 0x4a90d9)
  const fanLayer = new RenderLayer('fans', 0xe74c3c)

  const allObjects = []
  const pipesByLayer = {}

  tunnels.value.forEach((tunnel) => {
    try {
      const tunnelObj = ObjectFactory.createTunnel(tunnel)
      tunnelObj.userData = { ...tunnel, type: 'tunnel', originalData: tunnel }
      tunnelLayer.add(tunnelObj)
      addObjectToLayer(tunnelObj, `elevation_${tunnel.level}m`)
      addObjectToTypeLayer(tunnelObj, 'tunnel')
      addObject(tunnelObj)
      allObjects.push(tunnelObj)
      if (crossSectionTool) crossSectionTool.registerObject(tunnelObj)
    } catch (e) {
      console.warn(`Failed to create tunnel ${tunnel.id}:`, e)
    }
  })

  pipes.value.forEach((pipe) => {
    try {
      const pipeObj = ObjectFactory.createPipeLOD(pipe.points || [], pipe.diameter || 5, 0x4a90d9)
      pipeObj.userData = { ...pipe, type: 'pipe', originalData: pipe }
      pipeLayer.add(pipeObj)
      const layerId = pipe.layer || 'default'
      addObjectToLayer(pipeObj, `elevation_${layerId}m`)
      addObjectToTypeLayer(pipeObj, 'pipe')
      allObjects.push(pipeObj)
      
      if (!pipesByLayer[layerId]) pipesByLayer[layerId] = []
      pipesByLayer[layerId].push({ object: pipeObj, data: pipe })
      
      if (crossSectionTool) crossSectionTool.registerObject(pipeObj)
      if (props.useInstancing && instancedRenderer) {
        instancedRenderer.registerMesh(pipeObj, `pipe_${pipe.diameter || 5}_${0x4a90d9}`)
      }
    } catch (e) {
      console.warn(`Failed to create pipe ${pipe.id}:`, e)
    }
  })

  if (props.useLazyLoading && lazyLoader) {
    Object.keys(pipesByLayer).forEach(layerId => {
      lazyLoader.registerObjectsByLayer(`elevation_${layerId}m`, pipesByLayer[layerId])
    })
    const firstLayers = [...new Set(pipes.value.slice(0, 3).map(p => `elevation_${p.layer || 'default'}m`))]
    lazyLoader.setActiveLayers(firstLayers)
  } else {
    allObjects.forEach(obj => addObject(obj))
  }

  fans.value.forEach((fan) => {
    try {
      const fanObj = ObjectFactory.createFan(fan)
      fanObj.userData = { ...fan, type: 'fan', originalData: fan }
      fanLayer.add(fanObj)
      addObjectToLayer(fanObj, `elevation_${fan.level || 0}m`)
      addObjectToTypeLayer(fanObj, 'fan')
      addObject(fanObj)
      allObjects.push(fanObj)
    } catch (e) {
      console.warn(`Failed to create fan ${fan.id}:`, e)
    }
  })

  if (apiAnnotations.value && apiAnnotations.value.length > 0) {
    const annotationManager = getAnnotationManager()
    if (annotationManager) {
      apiAnnotations.value.forEach(async (anno) => {
        try {
          await annotationManager.addAnnotation(anno)
        } catch (e) {
          console.warn(`Failed to add annotation ${anno.id}:`, e)
        }
      })
    }
  }

  addObjectsToInteraction(allObjects)

  if (props.useInstancing && instancedRenderer) {
    instancedRenderer.rebuild()
  }

  objectsByType.value = {
    tunnels: tunnels.value,
    pipes: pipes.value,
    fans: fans.value,
    annotations: apiAnnotations.value || []
  }

  const sceneManager = getSceneManager()
  if (sceneManager && allObjects.length > 0) {
    const bbox = new THREE.Box3()
    allObjects.forEach(obj => {
      if (obj.isGroup) {
        obj.traverse(child => {
          if (child.isMesh) bbox.expandByObject(child)
        })
      } else if (obj.isMesh) {
        bbox.expandByObject(obj)
      }
    })

    if (!bbox.isEmpty()) {
      const center = new THREE.Vector3()
      bbox.getCenter(center)
      sceneManager.scene.position.sub(center)

      const cameraController = getCameraController()
      if (cameraController) {
        const size = new THREE.Vector3()
        bbox.getSize(size)
        const maxDim = Math.max(size.x, size.y, size.z)
        const defaultCamPos = new THREE.Vector3(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5)
        cameraController._controls.target.set(0, 0, 0)
        cameraController._camera.position.copy(defaultCamPos)
        cameraController._controls.update()
      }
    }
  }

  emit('load-complete', { objects: allObjects, count: allObjects.length })
}

const handleResize = () => {
  resize()
}

onMounted(() => {
  init()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeyDown)
  dispose()
})

defineExpose({
  isReady,
  isFullscreen,
  currentView,
  stats,
  initScene,
  dispose,
  clearScene,
  resize,
  addObject,
  removeObject,
  addObjectsToInteraction,
  addObjectToLayer,
  addObjectToTypeLayer,
  addObjectToLazyLoader,
  preloadLayer,
  unloadLayer,
  setActiveLayers,
  setView,
  resetCamera,
  flyTo,
  setLayerVisibility,
  toggleLayer,
  setLayerOpacity,
  isolateLayer,
  exitIsolation,
  getAllLayers,
  getTypeLayers,
  getElevationLayers,
  toggleFullscreen,
  on,
  onSelect,
  onDeselect,
  onHover,
  onHoverOut,
  onDoubleClick,
  onBoxSelect,
  onBatchSelect,
  getSelected,
  clearSelection,
  getSelectedObjects,
  setSelectedObjects,
  invertSelection,
  selectAllObjects,
  setBackgroundColor,
  setFog,
  setPerformanceMode,
  createCrossSection,
  removeCrossSection,
  updateCrossSection,
  enableSectionInteraction,
  autoGenerateSections,
  calculateSectionData,
  getSelectedAnnotations,
  clearAnnotationSelection,
  batchDeleteAnnotations,
  batchUpdateAnnotations,
  batchMoveAnnotations,
  alignAnnotations,
  getSceneManager,
  getCameraController,
  getInteractionManager,
  getLayerController,
  getAnnotationManager,
  getLazyLoader,
  getInstancedRenderer,
  getCrossSectionTool,
  getManagers,
  getObjects: () => objectsByType.value,
  getSelectedObject: () => selectedObject.value
})
</script>

<style scoped>
.scene-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a0a0a;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  color: #fff;
  gap: 16px;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255, 255, 255, 0.2);
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.label-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.performance-info {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 6px;
  padding: 10px 14px;
  display: flex;
  gap: 16px;
  z-index: 100;
  font-size: 12px;
  font-family: 'Consolas', monospace;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-label {
  color: #909399;
  font-size: 11px;
}

.stat-value {
  color: #409eff;
  font-size: 16px;
  font-weight: 600;
}

.stat-value.low {
  color: #f56c6c;
}
</style>
