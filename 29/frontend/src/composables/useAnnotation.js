import { ref, reactive, computed, onUnmounted } from 'vue'

export function useAnnotation(annotationManager) {
  const annotations = ref([])
  const isLoading = ref(false)
  const error = ref(null)

  const editingState = reactive({
    isEditing: false,
    editingAnnotation: null,
    isCreating: false,
    createType: 'text'
  })

  const filters = reactive({
    type: null,
    status: null,
    priority: null,
    targetType: null,
    targetId: null,
    level: undefined,
    minSeverity: undefined,
    searchQuery: ''
  })

  const filteredAnnotations = computed(() => {
    let result = [...annotations.value]

    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase()
      result = result.filter((anno) => {
        const data = anno.data
        return (
          data.name?.toLowerCase().includes(q) ||
          data.title?.toLowerCase().includes(q) ||
          data.description?.toLowerCase().includes(q) ||
          data.content?.toLowerCase().includes(q) ||
          data.tags?.some((tag) => tag.toLowerCase().includes(q))
        )
      })
    }

    if (filters.type) {
      result = result.filter((anno) => anno.data.type === filters.type)
    }
    if (filters.status) {
      result = result.filter((anno) => anno.data.status === filters.status)
    }
    if (filters.priority) {
      result = result.filter((anno) => anno.data.priority === filters.priority)
    }
    if (filters.targetType) {
      result = result.filter((anno) => anno.data.targetType === filters.targetType)
    }
    if (filters.targetId) {
      result = result.filter((anno) => anno.data.targetId === filters.targetId)
    }
    if (filters.level !== undefined) {
      result = result.filter((anno) => anno.data.level === filters.level)
    }
    if (filters.minSeverity !== undefined) {
      const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 }
      result = result.filter(
        (anno) => (severityOrder[anno.data.severity] || 0) >= filters.minSeverity
      )
    }

    return result
  })

  const stats = computed(() => ({
    total: annotations.value.length,
    filtered: filteredAnnotations.value.length,
    byType: countByField('type'),
    byStatus: countByField('status'),
    byPriority: countByField('priority'),
    bySeverity: countByField('severity')
  }))

  function countByField(field) {
    return annotations.value.reduce((acc, anno) => {
      const value = anno.data[field] || 'unknown'
      acc[value] = (acc[value] || 0) + 1
      return acc
    }, {})
  }

  const initAnnotations = async (loadOptions = {}) => {
    if (!annotationManager) {
      throw new Error('AnnotationManager is not initialized')
    }

    isLoading.value = true
    error.value = null

    try {
      const result = await annotationManager.loadAnnotations(loadOptions)
      annotations.value = result
      return result
    } catch (err) {
      error.value = err.message || '加载标注失败'
      console.error('Failed to load annotations:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const createTextAnnotation = async (options) => {
    if (!annotationManager) {
      throw new Error('AnnotationManager is not initialized')
    }

    isLoading.value = true
    error.value = null

    try {
      const result = await annotationManager.createTextAnnotation(options)
      annotations.value.push(result)
      return result
    } catch (err) {
      error.value = err.message || '创建文本标注失败'
      console.error('Failed to create text annotation:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const createIconAnnotation = async (options) => {
    if (!annotationManager) {
      throw new Error('AnnotationManager is not initialized')
    }

    isLoading.value = true
    error.value = null

    try {
      const result = await annotationManager.createIconAnnotation(options)
      annotations.value.push(result)
      return result
    } catch (err) {
      error.value = err.message || '创建图标标注失败'
      console.error('Failed to create icon annotation:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const addAnnotation = async (annotationData) => {
    if (!annotationManager) {
      throw new Error('AnnotationManager is not initialized')
    }

    isLoading.value = true
    error.value = null

    try {
      const result = await annotationManager.addAnnotation(annotationData)
      annotations.value.push(result)
      return result
    } catch (err) {
      error.value = err.message || '添加标注失败'
      console.error('Failed to add annotation:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const updateAnnotation = async (id, updates) => {
    if (!annotationManager) {
      throw new Error('AnnotationManager is not initialized')
    }

    isLoading.value = true
    error.value = null

    try {
      const result = await annotationManager.updateAnnotation(id, updates)
      if (result) {
        const index = annotations.value.findIndex((a) => a.id === id)
        if (index > -1) {
          annotations.value[index] = result
        }
      }
      return result
    } catch (err) {
      error.value = err.message || '更新标注失败'
      console.error('Failed to update annotation:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const deleteAnnotation = async (id) => {
    if (!annotationManager) {
      throw new Error('AnnotationManager is not initialized')
    }

    isLoading.value = true
    error.value = null

    try {
      const success = await annotationManager.deleteAnnotation(id)
      if (success) {
        annotations.value = annotations.value.filter((a) => a.id !== id)
        if (editingState.editingAnnotation?.id === id) {
          cancelEditing()
        }
      }
      return success
    } catch (err) {
      error.value = err.message || '删除标注失败'
      console.error('Failed to delete annotation:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const getAnnotationById = (id) => {
    return annotations.value.find((a) => a.id === id)
  }

  const showAnnotation = (id) => {
    if (!annotationManager) return
    annotationManager.showAnnotation(id)
    const anno = annotations.value.find((a) => a.id === id)
    if (anno) anno.visible = true
  }

  const hideAnnotation = (id) => {
    if (!annotationManager) return
    annotationManager.hideAnnotation(id)
    const anno = annotations.value.find((a) => a.id === id)
    if (anno) anno.visible = false
  }

  const showAllAnnotations = () => {
    if (!annotationManager) return
    annotationManager.showAll()
    annotations.value.forEach((a) => (a.visible = true))
  }

  const hideAllAnnotations = () => {
    if (!annotationManager) return
    annotationManager.hideAll()
    annotations.value.forEach((a) => (a.visible = false))
  }

  const toggleAnnotationVisibility = (id) => {
    const anno = annotations.value.find((a) => a.id === id)
    if (anno) {
      if (anno.visible) {
        hideAnnotation(id)
      } else {
        showAnnotation(id)
      }
    }
  }

  const searchAnnotations = (query) => {
    if (!annotationManager) return []
    return annotationManager.searchAnnotations(query)
  }

  const filterAnnotations = (filterOptions) => {
    if (!annotationManager) return []
    return annotationManager.filterAnnotations(filterOptions)
  }

  const setAnnotationStyle = (id, style) => {
    if (!annotationManager) return
    annotationManager.setAnnotationStyle(id, style)
  }

  const setGlobalStyle = (style) => {
    if (!annotationManager) return
    annotationManager.setGlobalStyle(style)
  }

  const startEditing = (annotation) => {
    editingState.isEditing = true
    editingState.editingAnnotation = { ...annotation }
  }

  const cancelEditing = () => {
    editingState.isEditing = false
    editingState.editingAnnotation = null
  }

  const saveEditing = async () => {
    if (!editingState.editingAnnotation) return null

    const { id, ...updates } = editingState.editingAnnotation.data
    const result = await updateAnnotation(id, updates)
    cancelEditing()
    return result
  }

  const startCreating = (type = 'text') => {
    editingState.isCreating = true
    editingState.createType = type
  }

  const cancelCreating = () => {
    editingState.isCreating = false
    editingState.createType = 'text'
  }

  const setFilters = (newFilters) => {
    Object.assign(filters, newFilters)
  }

  const resetFilters = () => {
    filters.type = null
    filters.status = null
    filters.priority = null
    filters.targetType = null
    filters.targetId = null
    filters.level = undefined
    filters.minSeverity = undefined
    filters.searchQuery = ''
  }

  const refreshAnnotations = async (loadOptions = {}) => {
    annotations.value = []
    return await initAnnotations(loadOptions)
  }

  const flyToAnnotation = async (id, cameraController) => {
    const annotation = getAnnotationById(id)
    if (!annotation || !cameraController) return false

    const position = annotation.object3D?.position || annotation.sprite?.position
    if (!position) return false

    const targetPosition = {
      x: position.x,
      y: position.y + 10,
      z: position.z + 20
    }
    const targetLookAt = {
      x: position.x,
      y: position.y,
      z: position.z
    }

    await cameraController.flyTo(
      { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z },
      { x: targetLookAt.x, y: targetLookAt.y, z: targetLookAt.z },
      1000
    )
    return true
  }

  const dispose = () => {
    annotations.value = []
    isLoading.value = false
    error.value = null
    cancelEditing()
    cancelCreating()
    resetFilters()
  }

  onUnmounted(() => {
    dispose()
  })

  return {
    annotations,
    filteredAnnotations,
    isLoading,
    error,
    editingState,
    filters,
    stats,

    initAnnotations,
    refreshAnnotations,

    createTextAnnotation,
    createIconAnnotation,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    getAnnotationById,

    showAnnotation,
    hideAnnotation,
    showAllAnnotations,
    hideAllAnnotations,
    toggleAnnotationVisibility,

    searchAnnotations,
    filterAnnotations,

    setAnnotationStyle,
    setGlobalStyle,

    startEditing,
    cancelEditing,
    saveEditing,

    startCreating,
    cancelCreating,

    setFilters,
    resetFilters,

    flyToAnnotation,

    dispose
  }
}
