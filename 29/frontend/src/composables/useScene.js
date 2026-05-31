import { ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import * as THREE from 'three'
import { SceneManager } from '../core/SceneManager'
import { CameraController } from '../core/CameraController'
import { InteractionManager } from '../core/InteractionManager'
import { LayerController } from '../core/LayerController'
import AnnotationManager from '../core/AnnotationManager'
import { LazyLoader } from '../core/LazyLoader'
import { InstancedRenderer } from '../core/InstancedRenderer'
import { CrossSectionTool } from '../core/CrossSectionTool'

export function useScene() {
  const containerRef = ref(null)
  const isReady = ref(false)
  const isFullscreen = ref(false)
  const currentView = ref('perspective')

  const stats = reactive({
    fps: 0,
    frameCount: 0,
    lastTime: performance.now(),
    objectCount: 0,
    drawCalls: 0,
    instancedCount: 0,
    lazyLoadedCount: 0,
    cameraPosition: { x: 0, y: 0, z: 0 }
  })

  let sceneManager = null
  let cameraController = null
  let interactionManager = null
  let layerController = null
  let annotationManager = null
  let lazyLoader = null
  let instancedRenderer = null
  let crossSectionTool = null
  let animationFrameId = null
  let eventListeners = []

  const initScene = async (options = {}) => {
    if (!containerRef.value) {
      await nextTick()
      if (!containerRef.value) {
        throw new Error('Container ref is not available')
      }
    }

    try {
      sceneManager = new SceneManager(containerRef.value, options.sceneOptions)
      cameraController = new CameraController(sceneManager.camera, sceneManager.getDomElement(), options.cameraOptions)
      interactionManager = new InteractionManager(sceneManager.camera, sceneManager.getDomElement(), options.interactionOptions)
      layerController = new LayerController(sceneManager.scene, options.layerOptions)
      annotationManager = new AnnotationManager(sceneManager.scene, sceneManager.camera, {
        ...options.annotationOptions,
        container: containerRef.value
      })
      lazyLoader = new LazyLoader(sceneManager.scene, sceneManager.camera, options.lazyLoaderOptions)
      instancedRenderer = new InstancedRenderer(sceneManager.scene, options.instancedOptions)
      crossSectionTool = new CrossSectionTool(
        sceneManager.scene,
        sceneManager.camera,
        sceneManager.getDomElement(),
        options.crossSectionOptions
      )

      sceneManager.onAnimate((delta, elapsed) => {
        cameraController.update()
        interactionManager.update()
        annotationManager.update()
        lazyLoader.update()
        instancedRenderer.updateCulling(sceneManager.camera)
        updateStats()
      })

      sceneManager.start()
      isReady.value = true

      return {
        sceneManager,
        cameraController,
        interactionManager,
        layerController,
        annotationManager,
        lazyLoader,
        instancedRenderer,
        crossSectionTool
      }
    } catch (error) {
      console.error('Failed to initialize scene:', error)
      throw error
    }
  }

  const updateStats = () => {
    stats.frameCount++
    const now = performance.now()
    const delta = now - stats.lastTime

    if (delta >= 1000) {
      stats.fps = Math.round((stats.frameCount * 1000) / delta)
      stats.frameCount = 0
      stats.lastTime = now
      
      const instancedStats = instancedRenderer?.getStats() || {}
      stats.drawCalls = instancedStats.drawCalls || 0
      stats.instancedCount = instancedStats.instancedCount || 0
      
      const lazyStats = lazyLoader?.getStats() || {}
      stats.lazyLoadedCount = lazyStats.loadedCount || 0
    }

    if (sceneManager?.camera) {
      stats.cameraPosition.x = Math.round(sceneManager.camera.position.x)
      stats.cameraPosition.y = Math.round(sceneManager.camera.position.y)
      stats.cameraPosition.z = Math.round(sceneManager.camera.position.z)
    }

    if (sceneManager?.scene) {
      let count = 0
      sceneManager.scene.traverse((obj) => {
        if (obj.isMesh || obj.isGroup) count++
      })
      stats.objectCount = count
    }
  }

  const addObject = (object) => {
    if (!sceneManager) return
    sceneManager.add(object)
    if (instancedRenderer) {
      instancedRenderer.registerMesh(object)
    }
  }

  const removeObject = (object) => {
    if (!sceneManager) return
    sceneManager.remove(object)
  }

  const addObjectsToInteraction = (objects) => {
    if (!interactionManager) return
    interactionManager.addObjects(objects)
  }

  const addObjectToLayer = (object, layerId) => {
    if (!layerController) return
    layerController.addObjectToLayer(object, layerId)
  }

  const addObjectToTypeLayer = (object, type) => {
    if (!layerController) return
    layerController.addObjectToTypeLayer(object, type)
  }

  const addObjectToLazyLoader = (object, data) => {
    if (!lazyLoader) return
    lazyLoader.registerObject(object, data)
  }

  const addObjectsToLazyLoaderByLayer = (layerId, objects) => {
    if (!lazyLoader) return
    lazyLoader.registerObjectsByLayer(layerId, objects)
  }

  const preloadLayer = (layerId, callback) => {
    if (!lazyLoader) return
    lazyLoader.preloadLayer(layerId, callback)
  }

  const unloadLayer = (layerId) => {
    if (!lazyLoader) return
    lazyLoader.unloadLayer(layerId)
  }

  const setActiveLayers = (layerIds) => {
    if (!lazyLoader) return
    lazyLoader.setActiveLayers(layerIds)
  }

  const registerObjectForInstancing = (object, groupKey) => {
    if (!instancedRenderer) return
    instancedRenderer.registerMesh(object, groupKey)
  }

  const registerObjectsForInstancing = (objects, groupKey) => {
    if (!instancedRenderer) return
    instancedRenderer.registerMeshes(objects, groupKey)
  }

  const rebuildInstancing = () => {
    if (!instancedRenderer) return
    instancedRenderer.rebuild()
  }

  const setPerformanceMode = (mode) => {
    if (!sceneManager) return
    sceneManager.setPerformanceMode(mode)
  }

  const createCrossSection = (options) => {
    if (!crossSectionTool) return null
    return crossSectionTool.createPlane(options)
  }

  const removeCrossSection = (planeId) => {
    if (!crossSectionTool) return
    crossSectionTool.removePlane(planeId)
  }

  const updateCrossSection = (planeId, position, normal) => {
    if (!crossSectionTool) return
    crossSectionTool.updatePlane(planeId, position, normal)
  }

  const registerObjectForSection = (object) => {
    if (!crossSectionTool) return
    crossSectionTool.registerObject(object)
  }

  const intersectObjectWithSection = (object, planeId) => {
    if (!crossSectionTool) return null
    return crossSectionTool.intersectObject(object, planeId)
  }

  const calculateSectionData = (object, planeId) => {
    if (!crossSectionTool) return null
    return crossSectionTool.calculateSectionData(object, planeId)
  }

  const enableSectionInteraction = (enabled) => {
    if (!crossSectionTool) return
    crossSectionTool.enableInteraction(enabled)
  }

  const autoGenerateSections = (object, count, axis) => {
    if (!crossSectionTool) return []
    return crossSectionTool.autoGenerateSections(object, count, axis)
  }

  const selectAnnotation = (id, multi) => {
    if (!annotationManager) return
    annotationManager.selectAnnotation(id, multi)
  }

  const batchDeleteAnnotations = (ids) => {
    if (!annotationManager) return
    annotationManager.batchDelete(ids)
  }

  const batchUpdateAnnotations = (ids, updates) => {
    if (!annotationManager) return
    annotationManager.batchUpdate(ids, updates)
  }

  const batchMoveAnnotations = (ids, offset) => {
    if (!annotationManager) return
    annotationManager.batchMove(ids, offset)
  }

  const alignAnnotations = (ids, alignment) => {
    if (!annotationManager) return
    annotationManager.alignAnnotations(ids, alignment)
  }

  const getSelectedAnnotations = () => {
    if (!annotationManager) return []
    return annotationManager.getSelectedAnnotations()
  }

  const clearAnnotationSelection = () => {
    if (!annotationManager) return
    annotationManager.clearSelection()
  }

  const getSelectedObjects = () => {
    if (!interactionManager) return []
    return interactionManager.getSelectedObjects()
  }

  const setSelectedObjects = (objects) => {
    if (!interactionManager) return
    interactionManager.setSelectedObjects(objects)
  }

  const invertSelection = () => {
    if (!interactionManager) return
    interactionManager.invertSelection()
  }

  const selectAllObjects = (filter) => {
    if (!interactionManager) return
    interactionManager.selectAll(filter)
  }

  const setView = async (viewName, duration = 1000) => {
    if (!cameraController) return
    await cameraController.setView(viewName, duration)
    currentView.value = viewName
  }

  const resetCamera = async () => {
    if (!cameraController) return
    await cameraController.reset()
    currentView.value = 'perspective'
  }

  const flyTo = async (position, target, duration = 1000) => {
    if (!cameraController) return
    const pos = new THREE.Vector3(position.x, position.y, position.z)
    const tgt = new THREE.Vector3(target.x, target.y, target.z)
    await cameraController.flyTo(pos, tgt, duration)
  }

  const setLayerVisibility = (layerId, visible) => {
    if (!layerController) return
    if (visible) {
      layerController.showLayer(layerId)
    } else {
      layerController.hideLayer(layerId)
    }
  }

  const toggleLayer = (layerId) => {
    if (!layerController) return
    layerController.toggleLayer(layerId)
  }

  const setLayerOpacity = (layerId, opacity) => {
    if (!layerController) return
    layerController.setLayerOpacity(layerId, opacity)
  }

  const isolateLayer = (layerId) => {
    if (!layerController) return
    layerController.isolateLayer(layerId)
  }

  const exitIsolation = () => {
    if (!layerController) return
    layerController.exitIsolation()
  }

  const getAllLayers = () => {
    if (!layerController) return []
    return layerController.getAllLayers()
  }

  const getTypeLayers = () => {
    if (!layerController) return []
    return layerController.getTypeLayers()
  }

  const getElevationLayers = () => {
    if (!layerController) return []
    return layerController.getElevationLayers()
  }

  const toggleFullscreen = () => {
    if (!containerRef.value) return

    if (!document.fullscreenElement) {
      containerRef.value.requestFullscreen()
      isFullscreen.value = true
    } else {
      document.exitFullscreen()
      isFullscreen.value = false
    }
  }

  const on = (eventName, callback) => {
    if (!interactionManager) return () => {}

    const handler = (event) => callback(event)
    interactionManager.addEventListener(eventName, handler)
    eventListeners.push({ eventName, handler })

    return () => {
      interactionManager.removeEventListener(eventName, handler)
      const index = eventListeners.findIndex(
        (e) => e.eventName === eventName && e.handler === handler
      )
      if (index > -1) {
        eventListeners.splice(index, 1)
      }
    }
  }

  const onSelect = (callback) => on('select', callback)
  const onDeselect = (callback) => on('deselect', callback)
  const onHover = (callback) => on('hover', callback)
  const onHoverOut = (callback) => on('hoverOut', callback)
  const onDoubleClick = (callback) => on('doubleClick', callback)
  const onBoxSelect = (callback) => on('boxSelect', callback)
  const onBatchSelect = (callback) => on('batchSelect', callback)
  const onBatchDeselect = (callback) => on('batchDeselect', callback)

  const getSelected = () => {
    if (!interactionManager) return null
    return interactionManager.getSelected()
  }

  const clearSelection = () => {
    if (!interactionManager) return
    interactionManager._clearSelection()
  }

  const setBackgroundColor = (color) => {
    if (!sceneManager) return
    sceneManager.setBackgroundColor(color)
  }

  const setFog = (enabled, near, far, color) => {
    if (!sceneManager) return
    sceneManager.setFog(enabled, near, far, color)
  }

  const resize = () => {
    if (!sceneManager) return
    sceneManager.resize()
  }

  const clearScene = () => {
    if (!sceneManager) return
    sceneManager.clear()
    if (interactionManager) {
      interactionManager.clearObjects()
    }
  }

  const dispose = () => {
    eventListeners.forEach(({ eventName, handler }) => {
      if (interactionManager) {
        interactionManager.removeEventListener(eventName, handler)
      }
    })
    eventListeners = []

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
    }

    if (crossSectionTool) {
      crossSectionTool.dispose()
    }
    if (instancedRenderer) {
      instancedRenderer.dispose()
    }
    if (lazyLoader) {
      lazyLoader.dispose()
    }
    if (annotationManager) {
      annotationManager.dispose()
    }
    if (layerController) {
      layerController.dispose()
    }
    if (interactionManager) {
      interactionManager.dispose()
    }
    if (cameraController) {
      cameraController.dispose()
    }
    if (sceneManager) {
      sceneManager.dispose()
    }

    sceneManager = null
    cameraController = null
    interactionManager = null
    layerController = null
    annotationManager = null
    lazyLoader = null
    instancedRenderer = null
    crossSectionTool = null
    isReady.value = false
  }

  const getSceneManager = () => sceneManager
  const getCameraController = () => cameraController
  const getInteractionManager = () => interactionManager
  const getManagers = () => ({
    sceneManager,
    cameraController,
    interactionManager,
    layerController,
    annotationManager,
    lazyLoader,
    instancedRenderer,
    crossSectionTool
  })
  const getLayerController = () => layerController
  const getAnnotationManager = () => annotationManager
  const getLazyLoader = () => lazyLoader
  const getInstancedRenderer = () => instancedRenderer
  const getCrossSectionTool = () => crossSectionTool

  onUnmounted(() => {
    dispose()
  })

  const handleFullscreenChange = () => {
    isFullscreen.value = !!document.fullscreenElement
  }

  onMounted(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange)
  })

  onUnmounted(() => {
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
  })

  watch(isFullscreen, (newVal) => {
    if (!newVal && document.fullscreenElement) {
      document.exitFullscreen()
    }
  })

  return {
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
    registerObjectForSection,

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
  }
}
