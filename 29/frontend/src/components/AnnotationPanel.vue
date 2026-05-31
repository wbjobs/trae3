<template>
  <div class="annotation-panel">
    <div class="panel-header">
      <span class="panel-title">
        <el-icon><CollectionTag /></el-icon>
        标注管理
      </span>
      <el-button type="primary" size="small" @click="showAddForm = true">
        <el-icon><Plus /></el-icon>
        添加
      </el-button>
    </div>

    <div class="panel-content">
      <div class="filter-bar">
        <el-input
          v-model="searchQuery"
          placeholder="搜索标注..."
          clearable
          size="small"
          :prefix-icon="Search"
        />
        <el-select v-model="filterType" placeholder="类型" size="small" clearable style="width: 120px">
          <el-option label="全部" value="" />
          <el-option label="监测点" value="monitoring_point" />
          <el-option label="安全警示" value="safety" />
          <el-option label="缺陷标注" value="defect" />
          <el-option label="文本标注" value="text" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="状态" size="small" clearable style="width: 100px">
          <el-option label="全部" value="" />
          <el-option label="正常" value="normal" />
          <el-option label="警告" value="warning" />
          <el-option label="告警" value="alarm" />
        </el-select>
        <el-tooltip content="多选模式">
          <el-button
            :type="isMultiSelectMode ? 'primary' : 'default'"
            size="small"
            :icon="CircleCheckFilled"
            @click="toggleMultiSelectMode"
          />
        </el-tooltip>
        <el-tooltip content="全选">
          <el-button size="small" :icon="List" @click="selectAllAnnotations" />
        </el-tooltip>
        <el-tooltip content="清空选择">
          <el-button size="small" :icon="Close" @click="clearAnnotationSelection" />
        </el-tooltip>
      </div>

      <div class="annotation-list">
        <div
          v-for="anno in filteredAnnotations"
          :key="anno.id"
          class="annotation-item"
          :class="{ 
            selected: selectedAnnotation?.id === anno.id || selectedAnnotationIds.has(anno.id),
            'multi-select': isMultiSelectMode
          }"
          @click="selectAnnotation(anno, $event)"
          @mousedown="handleAnnotationMouseDown(anno, $event)"
        >
          <div class="annotation-select" v-if="isMultiSelectMode">
            <el-checkbox :model-value="selectedAnnotationIds.has(anno.id)" />
          </div>
          <div class="annotation-icon" :style="{ background: getStatusColor(anno.data?.status) }">
            <el-icon v-if="anno.data?.type === 'monitoring_point'"><Monitor /></el-icon>
            <el-icon v-else-if="anno.data?.type === 'safety'"><WarningFilled /></el-icon>
            <el-icon v-else-if="anno.data?.type === 'defect'"><CircleCloseFilled /></el-icon>
            <el-icon v-else><Document /></el-icon>
          </div>
          <div class="annotation-info">
            <div class="annotation-title">
              {{ anno.data?.title || anno.data?.name || '未命名标注' }}
            </div>
            <div class="annotation-meta">
              <el-tag :type="getStatusTag(anno.data?.status)" size="small">
                {{ getStatusName(anno.data?.status) }}
              </el-tag>
              <span class="annotation-type">{{ getTypeName(anno.data?.type) }}</span>
            </div>
            <div class="annotation-content">
              {{ anno.data?.content || anno.data?.description || '' }}
            </div>
          </div>
          <div class="annotation-actions">
            <el-button
              type="primary"
              size="small"
              text
              @click.stop="editAnnotation(anno)"
            >
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button
              type="danger"
              size="small"
              text
              @click.stop="confirmDelete(anno)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>

        <div v-if="filteredAnnotations.length === 0" class="empty-state">
          <el-empty description="暂无标注数据" />
        </div>
      </div>
    </div>

    <div v-if="showBatchToolbar" class="batch-toolbar">
      <div class="batch-info">
        已选择 <span class="batch-count">{{ selectedAnnotationIds.size }}</span> 个标注
      </div>
      <div class="batch-actions">
        <el-dropdown @command="alignSelectedAnnotations">
          <el-button size="small" :icon="Guide">
            对齐
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="left">左对齐</el-dropdown-item>
              <el-dropdown-item command="right">右对齐</el-dropdown-item>
              <el-dropdown-item command="top">上对齐</el-dropdown-item>
              <el-dropdown-item command="bottom">下对齐</el-dropdown-item>
              <el-dropdown-item command="centerV">垂直居中</el-dropdown-item>
              <el-dropdown-item command="centerH">水平居中</el-dropdown-item>
              <el-dropdown-item divided command="spaceV">垂直等间距</el-dropdown-item>
              <el-dropdown-item command="spaceH">水平等间距</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        
        <el-dropdown @command="(dir) => moveSelectedAnnotations(dir.x, dir.y, dir.z)">
          <el-button size="small" :icon="Rank">
            移动
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :command="{ x: 1, y: 0, z: 0 }">X +1</el-dropdown-item>
              <el-dropdown-item :command="{ x: -1, y: 0, z: 0 }">X -1</el-dropdown-item>
              <el-dropdown-item :command="{ x: 0, y: 1, z: 0 }">Y +1</el-dropdown-item>
              <el-dropdown-item :command="{ x: 0, y: -1, z: 0 }">Y -1</el-dropdown-item>
              <el-dropdown-item :command="{ x: 0, y: 0, z: 1 }">Z +1</el-dropdown-item>
              <el-dropdown-item :command="{ x: 0, y: 0, z: -1 }">Z -1</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-button size="small" :icon="DocumentCopy" @click="copySelectedAnnotations">复制</el-button>
        <el-button size="small" :icon="Plus" @click="pasteAnnotations">粘贴</el-button>
        <el-button size="small" :icon="Download" @click="exportSelectedAnnotations">导出</el-button>
        <el-button size="small" type="danger" :icon="Delete" @click="deleteSelectedAnnotations">批量删除</el-button>
        <el-button size="small" :icon="Close" @click="clearAnnotationSelection">取消</el-button>
      </div>
    </div>

    <el-dialog
      v-model="showAddForm"
      :title="editingAnnotation ? '编辑标注' : '添加标注'"
      width="500px"
      @close="resetForm"
    >
      <el-form :model="annotationForm" label-width="80px">
        <el-form-item label="类型">
          <el-select v-model="annotationForm.type" style="width: 100%">
            <el-option label="监测点" value="monitoring_point" />
            <el-option label="安全警示" value="safety" />
            <el-option label="缺陷标注" value="defect" />
            <el-option label="文本标注" value="text" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="annotationForm.title" placeholder="请输入标题" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="annotationForm.content"
            type="textarea"
            :rows="3"
            placeholder="请输入标注内容"
          />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="annotationForm.color" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="annotationForm.status" style="width: 100%">
            <el-option label="正常" value="normal" />
            <el-option label="警告" value="warning" />
            <el-option label="告警" value="alarm" />
          </el-select>
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="annotationForm.position.x" placeholder="X" style="width: 30%" />
          <el-input v-model="annotationForm.position.y" placeholder="Y" style="width: 30%; margin: 0 10px" />
          <el-input v-model="annotationForm.position.z" placeholder="Z" style="width: 30%" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="annotationForm.priority">
            <el-radio value="low">低</el-radio>
            <el-radio value="medium">中</el-radio>
            <el-radio value="high">高</el-radio>
            <el-radio value="critical">紧急</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddForm = false">取消</el-button>
        <el-button type="primary" @click="saveAnnotation">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showStyleConfig" title="标注样式配置" width="400px">
      <el-form label-width="100px">
        <el-form-item label="字体大小">
          <el-input-number v-model="styleConfig.fontSize" :min="10" :max="24" />
        </el-form-item>
        <el-form-item label="背景透明度">
          <el-slider v-model="styleConfig.opacity" :min="0" :max="1" :step="0.1" />
        </el-form-item>
        <el-form-item label="边框颜色">
          <el-color-picker v-model="styleConfig.borderColor" />
        </el-form-item>
        <el-form-item label="图标大小">
          <el-input-number v-model="styleConfig.iconSize" :min="16" :max="64" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showStyleConfig = false">取消</el-button>
        <el-button type="primary" @click="applyStyle">应用</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showDeleteConfirm"
      title="删除确认"
      width="400px"
    >
      <p>确定要删除标注 "{{ deletingAnnotation?.data?.title || deletingAnnotation?.data?.name }}" 吗？</p>
      <p class="warning-text">此操作不可撤销。</p>
      <template #footer>
        <el-button @click="showDeleteConfirm = false">取消</el-button>
        <el-button type="danger" @click="deleteAnnotation">删除</el-button>
      </template>
    </el-dialog>

    <div class="panel-footer">
      <el-button size="small" @click="showStyleConfig = true">
        <el-icon><Setting /></el-icon>
        样式配置
      </el-button>
      <span class="annotation-count">共 {{ annotations.length }} 条标注</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, inject, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CollectionTag,
  Plus,
  Search,
  Edit,
  Delete,
  Monitor,
  WarningFilled,
  CircleCloseFilled,
  Document,
  Setting,
  CircleCheckFilled,
  List,
  Close,
  Guide,
  Rank,
  DocumentCopy,
  Download,
  ArrowDown
} from '@element-plus/icons-vue'

const annotationManager = inject('annotationManager')
const interactionManager = inject('interactionManager')

const showAddForm = ref(false)
const showStyleConfig = ref(false)
const showDeleteConfirm = ref(false)
const editingAnnotation = ref(null)
const deletingAnnotation = ref(null)
const selectedAnnotation = ref(null)
const searchQuery = ref('')
const filterType = ref('')
const filterStatus = ref('')

const annotations = ref([])
const selectedAnnotationIds = ref(new Set())
const clipboard = ref([])
const isMultiSelectMode = ref(false)
const boxSelectActive = ref(false)
const showBatchToolbar = ref(false)
const batchToolbarPosition = ref({ x: 0, y: 0 })

const annotationForm = reactive({
  type: 'text',
  title: '',
  content: '',
  color: '#4CAF50',
  status: 'normal',
  position: { x: 0, y: 0, z: 0 },
  priority: 'medium'
})

const styleConfig = reactive({
  fontSize: 14,
  opacity: 0.7,
  borderColor: '#333333',
  iconSize: 32
})

const filteredAnnotations = computed(() => {
  let result = annotations.value
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(anno =>
      (anno.data?.title || '').toLowerCase().includes(query) ||
      (anno.data?.name || '').toLowerCase().includes(query) ||
      (anno.data?.content || '').toLowerCase().includes(query) ||
      (anno.data?.description || '').toLowerCase().includes(query)
    )
  }
  
  if (filterType.value) {
    result = result.filter(anno => anno.data?.type === filterType.value)
  }
  
  if (filterStatus.value) {
    result = result.filter(anno => anno.data?.status === filterStatus.value)
  }
  
  return result
})

const getStatusColor = (status) => {
  const colors = {
    normal: '#4CAF50',
    warning: '#FF9800',
    alarm: '#F44336',
    standby: '#9E9E9E'
  }
  return colors[status] || colors.normal
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

const getTypeName = (type) => {
  const names = {
    monitoring_point: '监测点',
    safety: '安全警示',
    defect: '缺陷标注',
    text: '文本标注'
  }
  return names[type] || '其他'
}

const selectAnnotation = (anno, event) => {
  const isMulti = event?.ctrlKey || event?.metaKey || isMultiSelectMode.value
  
  if (annotationManager) {
    annotationManager.selectAnnotation(anno.id, isMulti)
  }
  
  if (interactionManager && anno.object3D) {
    if (isMulti) {
      const currentSelected = interactionManager.getSelectedObjects()
      const idx = currentSelected.findIndex(o => o.userData?.annotationId === anno.id)
      if (idx > -1) {
        currentSelected.splice(idx, 1)
      } else {
        currentSelected.push(anno.object3D)
      }
      interactionManager.setSelectedObjects(currentSelected)
    } else {
      interactionManager._setSelected(anno.object3D)
    }
  }
  
  if (isMulti) {
    if (selectedAnnotationIds.value.has(anno.id)) {
      selectedAnnotationIds.value.delete(anno.id)
    } else {
      selectedAnnotationIds.value.add(anno.id)
    }
    selectedAnnotationIds.value = new Set(selectedAnnotationIds.value)
  } else {
    selectedAnnotation.value = anno
    selectedAnnotationIds.value.clear()
    selectedAnnotationIds.value.add(anno.id)
  }
  
  if (selectedAnnotationIds.value.size > 1) {
    showBatchToolbar.value = true
  }
}

const handleAnnotationMouseDown = (anno, event) => {
  if (event.shiftKey) {
    boxSelectActive.value = true
    event.preventDefault()
  }
}

const toggleMultiSelectMode = () => {
  isMultiSelectMode.value = !isMultiSelectMode.value
  if (!isMultiSelectMode.value) {
    selectedAnnotationIds.value.clear()
    showBatchToolbar.value = false
  }
}

const selectAllAnnotations = () => {
  const ids = filteredAnnotations.value.map(a => a.id)
  selectedAnnotationIds.value = new Set(ids)
  isMultiSelectMode.value = true
  showBatchToolbar.value = ids.length > 1
  
  if (annotationManager) {
    ids.forEach(id => annotationManager.selectAnnotation(id, true))
  }
}

const clearAnnotationSelection = () => {
  selectedAnnotationIds.value.clear()
  selectedAnnotation.value = null
  showBatchToolbar.value = false
  
  if (annotationManager) {
    annotationManager.clearSelection()
  }
  if (interactionManager) {
    interactionManager.clearSelection()
  }
}

const getSelectedAnnotationIds = () => {
  return Array.from(selectedAnnotationIds.value)
}

const deleteSelectedAnnotations = async () => {
  const ids = getSelectedAnnotationIds()
  if (ids.length === 0) return
  
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${ids.length} 条标注吗？`,
      '批量删除确认',
      { type: 'warning' }
    )
    
    if (annotationManager) {
      await annotationManager.batchDelete(ids)
    }
    
    ElMessage.success(`成功删除 ${ids.length} 条标注`)
    await loadAnnotations()
    clearAnnotationSelection()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败: ' + e.message)
    }
  }
}

const moveSelectedAnnotations = async (dx, dy, dz) => {
  const ids = getSelectedAnnotationIds()
  if (ids.length === 0) return
  
  if (annotationManager) {
    annotationManager.batchMove(ids, { x: dx, y: dy, z: dz })
  }
  ElMessage.success(`已移动 ${ids.length} 条标注`)
}

const updateSelectedAnnotations = async (updates) => {
  const ids = getSelectedAnnotationIds()
  if (ids.length === 0) return
  
  if (annotationManager) {
    annotationManager.batchUpdate(ids, updates)
  }
  ElMessage.success(`已更新 ${ids.length} 条标注`)
}

const alignSelectedAnnotations = async (alignment) => {
  const ids = getSelectedAnnotationIds()
  if (ids.length < 2) {
    ElMessage.warning('请选择至少2条标注进行对齐')
    return
  }
  
  if (annotationManager) {
    annotationManager.alignAnnotations(ids, alignment)
  }
  
  const alignNames = {
    left: '左对齐',
    right: '右对齐',
    top: '上对齐',
    bottom: '下对齐',
    centerV: '垂直居中',
    centerH: '水平居中',
    spaceV: '垂直等间距',
    spaceH: '水平等间距'
  }
  
  ElMessage.success(`${alignNames[alignment]}完成`)
}

const copySelectedAnnotations = () => {
  const ids = getSelectedAnnotationIds()
  if (ids.length === 0) {
    ElMessage.warning('请先选择要复制的标注')
    return
  }
  
  if (annotationManager) {
    clipboard.value = annotationManager.copySelected()
    ElMessage.success(`已复制 ${clipboard.value.length} 条标注到剪贴板`)
  }
}

const pasteAnnotations = async () => {
  if (clipboard.value.length === 0) {
    ElMessage.warning('剪贴板为空，请先复制标注')
    return
  }
  
  if (annotationManager) {
    const offset = { x: 5, y: 0, z: 5 }
    const results = await annotationManager.pasteSelected(clipboard.value, offset)
    ElMessage.success(`成功粘贴 ${results.length} 条标注`)
    await loadAnnotations()
  }
}

const exportSelectedAnnotations = (format = 'json') => {
  const ids = getSelectedAnnotationIds()
  if (ids.length === 0) {
    ElMessage.warning('请选择要导出的标注')
    return
  }
  
  if (annotationManager) {
    const data = annotationManager.batchExport(ids, format)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `annotations_${Date.now()}.${format}`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`已导出 ${ids.length} 条标注`)
  }
}

const editAnnotation = (anno) => {
  editingAnnotation.value = anno
  annotationForm.type = anno.data?.type || 'text'
  annotationForm.title = anno.data?.title || anno.data?.name || ''
  annotationForm.content = anno.data?.content || anno.data?.description || ''
  annotationForm.color = getStatusColor(anno.data?.status)
  annotationForm.status = anno.data?.status || 'normal'
  annotationForm.position = {
    x: anno.data?.position?.x || 0,
    y: anno.data?.position?.y || 0,
    z: anno.data?.position?.z || 0
  }
  annotationForm.priority = anno.data?.priority || 'medium'
  showAddForm.value = true
}

const saveAnnotation = async () => {
  try {
    if (editingAnnotation.value) {
      await annotationManager.updateAnnotation(editingAnnotation.value.id, {
        type: annotationForm.type,
        title: annotationForm.title,
        content: annotationForm.content,
        status: annotationForm.status,
        priority: annotationForm.priority,
        position: annotationForm.position
      })
      ElMessage.success('标注更新成功')
    } else {
      await annotationManager.addAnnotation({
        type: annotationForm.type,
        title: annotationForm.title,
        content: annotationForm.content,
        status: annotationForm.status,
        priority: annotationForm.priority,
        position: annotationForm.position
      })
      ElMessage.success('标注添加成功')
    }
    await loadAnnotations()
    showAddForm.value = false
    resetForm()
  } catch (error) {
    ElMessage.error('保存失败: ' + error.message)
  }
}

const confirmDelete = (anno) => {
  deletingAnnotation.value = anno
  showDeleteConfirm.value = true
}

const deleteAnnotation = async () => {
  try {
    await annotationManager.deleteAnnotation(deletingAnnotation.value.id)
    ElMessage.success('标注删除成功')
    await loadAnnotations()
    showDeleteConfirm.value = false
    deletingAnnotation.value = null
    if (selectedAnnotation.value?.id === deletingAnnotation.value?.id) {
      selectedAnnotation.value = null
    }
  } catch (error) {
    ElMessage.error('删除失败: ' + error.message)
  }
}

const resetForm = () => {
  annotationForm.type = 'text'
  annotationForm.title = ''
  annotationForm.content = ''
  annotationForm.color = '#4CAF50'
  annotationForm.status = 'normal'
  annotationForm.position = { x: 0, y: 0, z: 0 }
  annotationForm.priority = 'medium'
  editingAnnotation.value = null
}

const applyStyle = () => {
  if (annotationManager) {
    annotationManager.setGlobalStyle({
      fontSize: `${styleConfig.fontSize}px`,
      backgroundColor: `rgba(0, 0, 0, ${styleConfig.opacity})`,
      border: `1px solid ${styleConfig.borderColor}`,
      iconSize: styleConfig.iconSize
    })
  }
  ElMessage.success('样式已应用')
  showStyleConfig.value = false
}

const loadAnnotations = async () => {
  if (annotationManager) {
    await annotationManager.loadAnnotations()
    annotations.value = annotationManager.getAllAnnotations()
  }
}

onMounted(() => {
  loadAnnotations()
})
</script>

<style scoped>
.annotation-panel {
  width: 380px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 40px);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, #67c23a, #529b2e);
  color: white;
  border-radius: 8px 8px 0 0;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.panel-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.filter-bar {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #ebeef5;
}

.filter-bar .el-input {
  flex: 1;
}

.annotation-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.annotation-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: #fafafa;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.annotation-item:hover {
  background: #f0f9eb;
}

.annotation-item.selected {
  border-color: #67c23a;
  background: #f0f9eb;
}

.annotation-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.annotation-info {
  flex: 1;
  min-width: 0;
}

.annotation-title {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.annotation-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.annotation-type {
  font-size: 12px;
  color: #909399;
}

.annotation-content {
  font-size: 13px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.annotation-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.annotation-item:hover .annotation-actions {
  opacity: 1;
}

.empty-state {
  padding: 40px 0;
}

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid #ebeef5;
}

.annotation-count {
  font-size: 13px;
  color: #909399;
}

.warning-text {
  color: #f56c6c;
  font-size: 13px;
  margin-top: 8px;
}

.annotation-item.multi-select {
  cursor: pointer;
}

.annotation-select {
  display: flex;
  align-items: center;
  padding-top: 4px;
}

.batch-toolbar {
  position: absolute;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.98);
  border-radius: 8px;
  padding: 12px 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 200;
  border: 1px solid #e4e7ed;
}

.batch-info {
  font-size: 14px;
  color: #606266;
  padding-right: 16px;
  border-right: 1px solid #e4e7ed;
}

.batch-count {
  color: #409eff;
  font-weight: 600;
  font-size: 16px;
  margin: 0 4px;
}

.batch-actions {
  display: flex;
  gap: 8px;
}

:deep(.el-form-item) {
  margin-bottom: 18px;
}
</style>
