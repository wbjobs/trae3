<template>
  <div class="trace-chain">
    <div class="chain-header">
      <h3 class="chain-title">
        <el-icon><Connection /></el-icon>
        溯源链条
      </h3>
      <el-button type="primary" link @click="toggleExpandAll">
        {{ allExpanded ? '收起全部' : '展开全部' }}
      </el-button>
    </div>
    <div class="chain-container">
      <div
        v-for="(node, index) in chainData"
        :key="node.id"
        class="chain-node"
        :class="{ 'is-last': index === chainData.length - 1 }"
      >
        <div class="node-timeline">
          <div class="node-dot" :class="getNodeClass(node.type)">
            <el-icon :size="16">
              <component :is="getNodeIcon(node.type)" />
            </el-icon>
          </div>
          <div v-if="index !== chainData.length - 1" class="node-line" :class="getNodeClass(node.type)"></div>
        </div>
        <div class="node-content">
          <div class="node-header" @click="toggleNode(node.id)">
            <div class="node-info">
              <el-tag :type="getTagType(node.type)" size="small" class="node-type-tag">
                {{ node.typeName }}
              </el-tag>
              <span class="node-operator">{{ node.operatorName }}</span>
              <span class="node-time">{{ formatTime(node.operateTime) }}</span>
            </div>
            <el-icon class="expand-icon" :class="{ 'is-expanded': expandedNodes.includes(node.id) }">
              <ArrowDown />
            </el-icon>
          </div>
          <div v-show="expandedNodes.includes(node.id)" class="node-detail">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="操作类型">
                {{ node.typeName }}
              </el-descriptions-item>
              <el-descriptions-item label="操作人">
                {{ node.operatorName }} ({{ node.operatorAccount }})
              </el-descriptions-item>
              <el-descriptions-item label="操作时间">
                {{ formatTime(node.operateTime) }}
              </el-descriptions-item>
              <el-descriptions-item label="IP地址">
                {{ node.ip }}
              </el-descriptions-item>
              <el-descriptions-item label="操作详情">
                <pre class="detail-content">{{ node.detail }}</pre>
              </el-descriptions-item>
              <el-descriptions-item v-if="node.remark" label="备注">
                {{ node.remark }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>
      </div>
    </div>
    <el-empty v-if="chainData.length === 0" description="暂无溯源数据" />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import {
  Edit,
  Check,
  Close,
  Upload,
  Download,
  Delete,
  Setting,
  ArrowDown,
  Connection
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const props = defineProps({
  chainData: {
    type: Array,
    default: () => []
  }
})

const expandedNodes = ref([])
const allExpanded = ref(false)

const formatTime = (time) => {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
}

const getNodeClass = (type) => {
  const classMap = {
    create: 'info',
    submit: 'primary',
    approve: 'success',
    reject: 'danger',
    distribute: 'warning',
    receive: 'success',
    return: 'warning',
    cancel: 'info',
    update: 'primary',
    export: 'success'
  }
  return classMap[type] || 'info'
}

const getNodeIcon = (type) => {
  const iconMap = {
    create: Edit,
    submit: Upload,
    approve: Check,
    reject: Close,
    distribute: Setting,
    receive: Download,
    return: Upload,
    cancel: Delete,
    update: Edit,
    export: Download
  }
  return iconMap[type] || Setting
}

const getTagType = (type) => {
  const typeMap = {
    create: 'info',
    submit: 'primary',
    approve: 'success',
    reject: 'danger',
    distribute: 'warning',
    receive: 'success',
    return: 'warning',
    cancel: 'info',
    update: 'primary',
    export: 'success'
  }
  return typeMap[type] || 'info'
}

const toggleNode = (id) => {
  const index = expandedNodes.value.indexOf(id)
  if (index > -1) {
    expandedNodes.value.splice(index, 1)
  } else {
    expandedNodes.value.push(id)
  }
}

const toggleExpandAll = () => {
  allExpanded.value = !allExpanded.value
  if (allExpanded.value) {
    expandedNodes.value = props.chainData.map(item => item.id)
  } else {
    expandedNodes.value = []
  }
}

watch(() => props.chainData, () => {
  expandedNodes.value = []
  allExpanded.value = false
}, { deep: true })
</script>

<style scoped>
.trace-chain {
  padding: 10px 0;
}

.chain-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.chain-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.chain-container {
  padding-left: 10px;
}

.chain-node {
  display: flex;
  position: relative;
}

.chain-node:not(:last-child) {
  margin-bottom: 8px;
}

.node-timeline {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 16px;
}

.node-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  z-index: 1;
}

.node-dot.info {
  background-color: #909399;
}

.node-dot.primary {
  background-color: #409eff;
}

.node-dot.success {
  background-color: #67c23a;
}

.node-dot.danger {
  background-color: #f56c6c;
}

.node-dot.warning {
  background-color: #e6a23c;
}

.node-line {
  width: 2px;
  flex: 1;
  min-height: 30px;
  margin-top: 4px;
}

.node-line.info {
  background-color: #dcdfe6;
}

.node-line.primary {
  background-color: #a0cfff;
}

.node-line.success {
  background-color: #c2e7b0;
}

.node-line.danger {
  background-color: #fab6b6;
}

.node-line.warning {
  background-color: #f5dab1;
}

.node-content {
  flex: 1;
  padding-bottom: 16px;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background-color: #fafafa;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.node-header:hover {
  background-color: #f5f7fa;
}

.node-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.node-type-tag {
  font-weight: 500;
}

.node-operator {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.node-time {
  font-size: 13px;
  color: #909399;
}

.expand-icon {
  color: #909399;
  transition: transform 0.3s;
}

.expand-icon.is-expanded {
  transform: rotate(180deg);
}

.node-detail {
  margin-top: 12px;
}

.detail-content {
  margin: 0;
  padding: 8px 12px;
  background-color: #f5f7fa;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: #606266;
}
</style>
