<template>
  <div class="status-card" :class="statusClass">
    <div class="status-icon">
      <el-icon size="28"><component :is="icon" /></el-icon>
    </div>
    <div class="status-content">
      <div class="status-label">{{ label }}</div>
      <div class="status-value">
        <span class="value">{{ value }}</span>
        <span class="unit" v-if="unit">{{ unit }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineProps } from 'vue'

const props = defineProps({
  label: String,
  value: [String, Number],
  unit: String,
  status: {
    type: String,
    default: 'normal'
  },
  icon: {
    type: String,
    default: 'DataLine'
  }
})

const statusClass = computed(() => `status-${props.status}`)
</script>

<style scoped>
.status-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border-left: 4px solid #409eff;
  transition: all 0.3s;
}

.status-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.status-card.status-normal {
  border-left-color: #409eff;
}

.status-card.status-success {
  border-left-color: #67c23a;
}

.status-card.status-warning {
  border-left-color: #e6a23c;
}

.status-card.status-danger {
  border-left-color: #f56c6c;
}

.status-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
}

.status-card.status-success .status-icon {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}

.status-card.status-warning .status-icon {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.status-card.status-danger .status-icon {
  background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
}

.status-content {
  flex: 1;
}

.status-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.status-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.value {
  font-size: 28px;
  font-weight: 600;
  color: #333;
}

.unit {
  font-size: 14px;
  color: #999;
}
</style>
