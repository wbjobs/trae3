<template>
  <div class="filter-bar">
    <div class="filter-item">
      <span class="filter-label">设备选择:</span>
      <el-select
        v-model="localFilters.deviceCode"
        placeholder="请选择设备"
        style="width: 200px"
        @change="handleFilterChange"
      >
        <el-option
          v-for="device in devices"
          :key="device.device_code"
          :label="device.device_name"
          :value="device.device_code"
        />
      </el-select>
    </div>

    <div class="filter-item">
      <span class="filter-label">时间范围:</span>
      <el-date-picker
        v-model="localFilters.timeRange"
        type="datetimerange"
        range-separator="至"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        format="YYYY-MM-DD HH:mm:ss"
        value-format="YYYY-MM-DD HH:mm:ss"
        style="width: 360px"
        @change="handleFilterChange"
      />
    </div>

    <div class="filter-item" v-if="showQuickSelect">
      <el-button-group>
        <el-button @click="setQuickTime(1)">最近1小时</el-button>
        <el-button @click="setQuickTime(24)">最近24小时</el-button>
        <el-button @click="setQuickTime(168)">最近7天</el-button>
      </el-button-group>
    </div>

    <div class="filter-item">
      <el-button type="primary" @click="handleQuery">
        <el-icon><Search /></el-icon>
        查询
      </el-button>
      <el-button @click="handleReset">重置</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits, onMounted } from 'vue'
import dayjs from 'dayjs'

const props = defineProps({
  devices: {
    type: Array,
    default: () => []
  },
  filters: {
    type: Object,
    default: () => ({})
  },
  showQuickSelect: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:filters', 'query'])

const localFilters = ref({
  deviceCode: '',
  timeRange: [],
  ...props.filters
})

watch(() => props.filters, (newVal) => {
  localFilters.value = { ...localFilters.value, ...newVal }
}, { deep: true })

const handleFilterChange = () => {
  emit('update:filters', { ...localFilters.value })
}

const handleQuery = () => {
  const params = {
    device_code: localFilters.value.deviceCode,
    start_time: localFilters.value.timeRange?.[0],
    end_time: localFilters.value.timeRange?.[1]
  }
  emit('query', params)
}

const handleReset = () => {
  localFilters.value = {
    deviceCode: '',
    timeRange: []
  }
  emit('update:filters', { ...localFilters.value })
}

const setQuickTime = (hours) => {
  const end = dayjs()
  const start = end.subtract(hours, 'hour')
  localFilters.value.timeRange = [
    start.format('YYYY-MM-DD HH:mm:ss'),
    end.format('YYYY-MM-DD HH:mm:ss')
  ]
  handleFilterChange()
}

onMounted(() => {
  if (props.devices.length > 0 && !localFilters.value.deviceCode) {
    localFilters.value.deviceCode = props.devices[0].device_code
  }
})
</script>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #fafafa;
  border-radius: 8px;
  margin-bottom: 24px;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  color: #666;
  white-space: nowrap;
  font-size: 14px;
}
</style>
