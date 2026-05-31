<template>
  <div class="deep-analysis-page">
    <el-card class="header-card" shadow="never">
      <div class="page-header">
        <div class="header-left">
          <h2>
            <el-icon><DataAnalysis /></el-icon>
            深度分析与钻取
          </h2>
          <p class="subtitle">多维度时序数据分析、趋势预测与智能诊断</p>
        </div>
        <div class="header-actions">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item active>深度分析</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
      </div>
    </el-card>

    <el-row :gutter="16" class="control-row">
      <el-col :span="6">
        <el-form-item label="设备选择" label-width="80px">
          <el-select v-model="selectedDevice" placeholder="选择设备" @change="onDeviceChange">
            <el-option
              v-for="device in devices"
              :key="device.code"
              :label="device.name"
              :value="device.code"
            />
          </el-select>
        </el-form-item>
      </el-col>

      <el-col :span="10">
        <el-form-item label="时间范围" label-width="80px">
          <el-date-picker
            v-model="timeRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DDTHH:mm:ss"
            :shortcuts="timeShortcuts"
            @change="onTimeRangeChange"
          />
        </el-form-item>
      </el-col>

      <el-col :span="8">
        <div class="drill-controls">
          <span class="drill-label">钻取级别:</span>
          <el-radio-group v-model="activeDrillLevel" size="default" @change="onDrillLevelChange">
            <el-radio-button
              v-for="(level, index) in drillLevels"
              :key="level.name"
              :value="index"
            >
              <el-tooltip :content="`粒度: ${level.granularity}, 时间跨度: ${level.timeSpan}`">
                {{ level.name }}
              </el-tooltip>
            </el-radio-button>
          </el-radio-group>

          <el-button
            :icon="ArrowUp"
            :disabled="!canDrillUp"
            @click="drillUp"
            class="drill-btn"
          >
            上钻
          </el-button>
          <el-button
            :icon="ArrowDown"
            :disabled="!canDrillDown"
            type="primary"
            @click="drillDown"
            class="drill-btn"
          >
            下钻
          </el-button>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #409EFF;">
            <el-icon><TrendCharts /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">数据点数</div>
            <div class="stat-value">{{ dataPointCount.toLocaleString() }}</div>
            <div class="stat-trend">
              <el-tag :type="storageType === 'hot' ? 'success' : 'info'" size="small">
                {{ storageType === 'hot' ? '热数据' : '含冷数据' }}
              </el-tag>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="stat-card" shadow="hover" v-if="predictionResult">
          <div class="stat-icon" style="background: #67C23A;">
            <el-icon><TrendCharts /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">趋势方向</div>
            <div class="stat-value">
              {{ getTrendDirectionText(predictionResult.trend_analysis?.trend_direction) }}
            </div>
            <div class="stat-trend">
              斜率: {{ predictionResult.trend_analysis?.trend_slope?.toFixed(4) || '0' }}
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="stat-card" shadow="hover" v-if="predictionResult?.rul_prediction">
          <div class="stat-icon" :style="{ background: getRULColor() }">
            <el-icon><Clock /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">剩余寿命</div>
            <div class="stat-value">
              {{ formatRUL(predictionResult.rul_prediction.remaining_useful_life_hours) }}
            </div>
            <div class="stat-trend">
              置信度: {{ (predictionResult.rul_prediction.confidence * 100).toFixed(1) }}%
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="stat-card" shadow="hover" v-if="predictionResult">
          <div class="stat-icon" :style="{ background: getSeverityColor(predictionResult.predicted_severity) }">
            <el-icon><Warning /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">预测状态</div>
            <div class="stat-value">
              {{ getSeverityText(predictionResult.predicted_severity) }}
            </div>
            <div class="stat-trend">
              <el-tag :type="getSeverityTagType(predictionResult.predicted_severity)" size="small">
                {{ predictionResult.predicted_severity }}
              </el-tag>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="chart-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <div class="header-title">
            <el-icon><LineChart /></el-icon>
            振动时序分析
            <el-tag size="small" type="info" style="margin-left: 8px;">
              {{ drillLevels[activeDrillLevel].granularity }} 粒度
            </el-tag>
          </div>
          <div class="header-tools">
            <el-button-group>
              <el-button size="small" @click="loadPrediction" :loading="predicting">
                <el-icon><TrendCharts /></el-icon>
                趋势预测
              </el-button>
              <el-button size="small" @click="runEnsemblePrediction" :loading="ensemblePredicting">
                集成预测
              </el-button>
            </el-button-group>
            <el-select v-model="predictionMethod" size="small" placeholder="预测方法" style="width: 140px; margin-left: 8px;">
              <el-option label="指数平滑" value="exponential_smoothing" />
              <el-option label="ARIMA" value="arima" />
              <el-option label="线性回归" value="linear_regression" />
              <el-option label="EMA" value="ema" />
            </el-select>
          </div>
        </div>
      </template>

      <div ref="vibrationChartRef" class="chart-container"></div>

      <div class="chart-legend" v-if="predictionResult">
        <span class="legend-item">
          <span class="legend-color" style="background: #409EFF;"></span>
          历史数据
        </span>
        <span class="legend-item">
          <span class="legend-color" style="background: #E6A23C;"></span>
          预测值
        </span>
        <span class="legend-item">
          <span class="legend-color" style="background: #F56C6C; opacity: 0.3;"></span>
          95%置信区间
        </span>
        <span class="legend-item" v-if="predictionResult.rul_prediction?.estimated_failure_date">
          <el-icon><WarningFilled style="color: #F56C6C;" /></el-icon>
          预计故障: {{ formatDate(predictionResult.rul_prediction.estimated_failure_date) }}
        </span>
      </div>
    </el-card>

    <el-row :gutter="16" class="multi-chart-row">
      <el-col :span="12">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <div class="header-title">
                <el-icon><Histogram /></el-icon>
                指标分布趋势
              </div>
            </div>
          </template>
          <div ref="trendChartRef" class="chart-container small-chart"></div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <div class="header-title">
                <el-icon><PieChart /></el-icon>
                严重度分布
              </div>
            </div>
          </template>
          <div ref="severityChartRef" class="chart-container small-chart"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="analysis-card" shadow="hover" v-if="predictionResult">
      <template #header>
        <div class="card-header">
          <div class="header-title">
            <el-icon><Document /></el-icon>
            智能诊断报告
          </div>
          <el-tag :type="getSeverityTagType(predictionResult.predicted_severity)" size="default">
            {{ getSeverityText(predictionResult.predicted_severity) }}
          </el-tag>
        </div>
      </template>

      <el-descriptions :column="2" border>
        <el-descriptions-item label="当前状态">
          <el-tag :type="getSeverityTagType(predictionResult.current_severity)">
            {{ getSeverityText(predictionResult.current_severity) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="预测状态">
          <el-tag :type="getSeverityTagType(predictionResult.predicted_severity)">
            {{ getSeverityText(predictionResult.predicted_severity) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="趋势方向">
          {{ getTrendDirectionText(predictionResult.trend_analysis?.trend_direction) }}
        </el-descriptions-item>
        <el-descriptions-item label="趋势强度">
          {{ (predictionResult.trend_analysis?.trend_strength * 100).toFixed(1) }}%
        </el-descriptions-item>
        <el-descriptions-item label="趋势斜率">
          {{ predictionResult.trend_analysis?.trend_slope?.toFixed(6) }}
        </el-descriptions-item>
        <el-descriptions-item label="波动率">
          {{ (predictionResult.trend_analysis?.volatility * 100).toFixed(2) }}%
        </el-descriptions-item>
        <el-descriptions-item label="预测步数">
          {{ predictionResult.forecast_points }} 步
        </el-descriptions-item>
        <el-descriptions-item label="历史数据点">
          {{ predictionResult.historical_points }} 个
        </el-descriptions-item>
        <el-descriptions-item label="预计故障时间" v-if="predictionResult.rul_prediction?.estimated_failure_date">
          <el-tag type="danger">
            {{ formatDate(predictionResult.rul_prediction.estimated_failure_date) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="剩余寿命" v-if="predictionResult.rul_prediction">
          {{ formatRUL(predictionResult.rul_prediction.remaining_useful_life_hours) }}
          (置信度: {{ (predictionResult.rul_prediction.confidence * 100).toFixed(1) }}%)
        </el-descriptions-item>
        <el-descriptions-item label="预测方法">
          {{ predictionResult.prediction_method }}
        </el-descriptions-item>
        <el-descriptions-item label="模型R²" v-if="predictionResult.model_metrics?.r_squared">
          {{ predictionResult.model_metrics.r_squared.toFixed(4) }}
        </el-descriptions-item>
      </el-descriptions>

      <el-alert
        v-if="predictionResult.warnings && predictionResult.warnings.length > 0"
        :title="predictionResult.warnings.join('; ')"
        type="warning"
        show-icon
        class="alert-box"
      />

      <div class="diagnosis-suggestions" v-if="predictionResult.predicted_severity !== 'normal'">
        <h4>
          <el-icon><Lightbulb /></el-icon>
          维护建议
        </h4>
        <ul>
          <li v-if="predictionResult.predicted_severity === 'warning'">
            建议加强设备监控频率，增加巡检次数
          </li>
          <li v-if="predictionResult.trend_analysis?.trend_direction === 'increasing'">
            振动值呈上升趋势，建议安排预防性维护
          </li>
          <li v-if="predictionResult.rul_prediction?.remaining_useful_life_hours < 168">
            剩余寿命不足一周，建议尽快安排备件和维修计划
          </li>
          <li v-if="predictionResult.predicted_severity === 'alert' || predictionResult.predicted_severity === 'critical'">
            <strong>紧急建议:</strong> 立即安排专业人员现场检测，考虑停机检修
          </li>
          <li v-if="predictionResult.trend_analysis?.acceleration > 0">
            劣化速度加快，建议缩短检测周期
          </li>
        </ul>
      </div>
    </el-card>

    <el-card class="archive-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <div class="header-title">
            <el-icon><FolderOpened /></el-icon>
            数据存储管理
          </div>
          <el-button size="small" @click="loadArchiveStats">
            刷新
          </el-button>
        </div>
      </template>

      <el-row :gutter="16">
        <el-col :span="8">
          <el-statistic title="热数据(最近7天)" :value="archiveStats?.hot_record_count || 0" />
        </el-col>
        <el-col :span="8">
          <el-statistic title="冷数据(归档)" :value="archiveStats?.cold_record_count || 0" />
        </el-col>
        <el-col :span="8">
          <div class="archive-actions">
            <el-button type="primary" @click="runArchive" :loading="archiving">
              执行归档
            </el-button>
            <el-button @click="loadArchiveStats">查看统计</el-button>
          </div>
        </el-col>
      </el-row>

      <el-divider />

      <el-descriptions :column="3" size="small" v-if="archiveStats">
        <el-descriptions-item label="下次自动归档">
          {{ formatDate(archiveStats.next_archive_time) }}
        </el-descriptions-item>
        <el-descriptions-item label="数据分界点">
          {{ formatDate(archiveStats.cutoff_date) }}
        </el-descriptions-item>
        <el-descriptions-item label="冷数据路径">
          {{ archiveStats.config?.cold_db_path }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-empty v-if="!selectedDevice" description="请选择设备开始分析" style="padding: 60px 0;" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  DataAnalysis, LineChart, PieChart, Histogram, TrendCharts,
  ArrowUp, ArrowDown, Clock, Warning, Document,
  FolderOpened, Lightbulb, WarningFilled
} from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { useDrillDownStore } from '@/stores/drillDown'
import { createHighPerformanceChart } from '@/utils/chartEngine'
import { DataSampler } from '@/utils/dataSampler'
import { vibrationApi } from '@/api/vibration'
import { deviceApi } from '@/api/devices'
import { advancedApi } from '@/api/advanced'

const router = useRouter()
const drillStore = useDrillDownStore()

const devices = ref([])
const selectedDevice = ref('')
const timeRange = ref([])
const activeDrillLevel = ref(0)
const predictionMethod = ref('exponential_smoothing')

const dataPointCount = ref(0)
const storageType = ref('hot')
const predicting = ref(false)
const ensemblePredicting = ref(false)
const archiving = ref(false)
const predictionResult = ref(null)
const archiveStats = ref(null)

const vibrationChartRef = ref(null)
const trendChartRef = ref(null)
const severityChartRef = ref(null)

let vibrationChart = null
let trendChart = null
let severityChart = null

const historicalData = ref([])
const anomalyData = ref([])

const drillLevels = computed(() => drillStore.drillLevels)
const canDrillDown = computed(() => drillStore.canDrillDown)
const canDrillUp = computed(() => drillStore.canDrillUp)

const timeShortcuts = [
  { text: '最近1小时', value: () => [new Date(Date.now() - 3600000), new Date()] },
  { text: '最近6小时', value: () => [new Date(Date.now() - 21600000), new Date()] },
  { text: '最近24小时', value: () => [new Date(Date.now() - 86400000), new Date()] },
  { text: '最近7天', value: () => [new Date(Date.now() - 604800000), new Date()] },
  { text: '最近30天', value: () => [new Date(Date.now() - 2592000000), new Date()] }
]

onMounted(async () => {
  const defaultEnd = new Date()
  const defaultStart = new Date(defaultEnd.getTime() - 24 * 60 * 60 * 1000)
  timeRange.value = [defaultStart.toISOString(), defaultEnd.toISOString()]

  await loadDevices()
  initCharts()

  drillStore.registerChart('main-vibration', {
    timeRangeChanged: onTimeRangeSync,
    deviceChanged: onDeviceSync,
    zoomToRange: onZoomSync
  })
})

onBeforeUnmount(() => {
  drillStore.unregisterChart('main-vibration')
  if (vibrationChart) vibrationChart.dispose()
  if (trendChart) trendChart.dispose()
  if (severityChart) severityChart.dispose()
})

function initCharts() {
  nextTick(() => {
    if (vibrationChartRef.value) {
      vibrationChart = createHighPerformanceChart(vibrationChartRef.value, {
        key: 'deep-analysis-main',
        throttleMs: 16
      })
    }
    if (trendChartRef.value) {
      trendChart = echarts.init(trendChartRef.value)
    }
    if (severityChartRef.value) {
      severityChart = echarts.init(severityChartRef.value)
    }
  })
}

async function loadDevices() {
  try {
    const res = await deviceApi.getDevices()
    devices.value = res.data || []
    if (devices.value.length > 0) {
      selectedDevice.value = devices.value[0].code
      await onDeviceChange()
    }
  } catch (e) {
    ElMessage.error('加载设备列表失败')
  }
}

async function onDeviceChange() {
  if (!selectedDevice.value) return
  drillStore.setSelectedDevice(selectedDevice.value)
  await loadData()
  await loadArchiveStats()
}

function onTimeRangeChange() {
  if (timeRange.value && timeRange.value.length === 2) {
    drillStore.setTimeRange(timeRange.value[0], timeRange.value[1])
    loadData()
  }
}

function onDrillLevelChange(level) {
  drillStore.goToLevel(level)
  loadData()
}

function drillDown() {
  drillStore.drillDown()
  activeDrillLevel.value = drillStore.activeDrillLevel
  loadData()
}

function drillUp() {
  drillStore.drillUp()
  activeDrillLevel.value = drillStore.activeDrillLevel
  loadData()
}

function onTimeRangeSync(range) {
  if (range.startTime && range.endTime) {
    timeRange.value = [range.startTime, range.endTime]
  }
}

function onDeviceSync(device) {
  selectedDevice.value = device
}

function onZoomSync(range) {
  if (range.startTime && range.endTime) {
    timeRange.value = [range.startTime, range.endTime]
    loadData()
  }
}

async function loadData() {
  if (!selectedDevice.value || !timeRange.value?.length) return

  try {
    const level = drillStore.currentLevel
    const params = {
      device_code: selectedDevice.value,
      start_time: timeRange.value[0],
      end_time: timeRange.value[1],
      aggregation: level.granularity,
      use_sampling: true,
      limit: 5000
    }

    const res = await advancedApi.queryHotAndCold(params)

    if (res.success && res.data) {
      historicalData.value = res.data
      dataPointCount.value = res.summary?.total_count || res.data.length
      storageType.value = res.summary?.cold_count > 0 ? 'combined' : 'hot'
      processAndRenderCharts()
    }
  } catch (e) {
    console.error('Load data error:', e)
  }
}

function processAndRenderCharts() {
  if (!historicalData.value.length) return

  const rawData = historicalData.value
  const timestamps = rawData.map(d => new Date(d.timestamp))
  const rmsValues = rawData.map(d => Math.sqrt(d.x_axis ** 2 + d.y_axis ** 2 + d.z_axis ** 2))
  const peakValues = rawData.map(d => Math.max(Math.abs(d.x_axis), Math.abs(d.y_axis), Math.abs(d.z_axis)))
  const tempValues = rawData.map(d => d.temperature)

  const maxPoints = 2000
  const sampled = DataSampler.downsampleMultiAxis(
    [rmsValues, peakValues, tempValues],
    timestamps,
    maxPoints
  )

  renderVibrationChart(sampled.xData, sampled.yData[0], sampled.yData[1])
  renderTrendChart(sampled.xData, sampled.yData[0], sampled.yData[2])
}

function renderVibrationChart(timestamps, rmsData, peakData) {
  if (!vibrationChart) return

  const xData = timestamps.map(t => t.toLocaleString())

  const series = [
    {
      name: 'RMS振动值',
      type: 'line',
      data: rmsData,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2, color: '#409EFF' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
          { offset: 1, color: 'rgba(64, 158, 255, 0.05)' }
        ])
      }
    },
    {
      name: '峰值',
      type: 'line',
      data: peakData,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 1.5, color: '#67C23A' }
    }
  ]

  if (predictionResult.value?.predictions?.length) {
    const predTimestamps = predictionResult.value.predictions.map(p =>
      new Date(p.timestamp).toLocaleString()
    )
    const predValues = predictionResult.value.predictions.map(p => p.predicted_value)
    const lowerBounds = predictionResult.value.predictions.map(p => p.lower_bound)
    const upperBounds = predictionResult.value.predictions.map(p => p.upper_bound)

    const lastX = xData[xData.length - 1]
    const lastY = rmsData[rmsData.length - 1]
    predTimestamps.unshift(lastX)
    predValues.unshift(lastY)
    lowerBounds.unshift(lastY)
    upperBounds.unshift(lastY)

    series.push(
      {
        name: '预测值',
        type: 'line',
        data: predValues,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: '#E6A23C', type: 'dashed' }
      },
      {
        name: '置信区间',
        type: 'line',
        data: upperBounds,
        lineStyle: { width: 0 },
        stack: 'confidence',
        areaStyle: {
          color: 'rgba(230, 162, 60, 0.2)'
        }
      },
      {
        name: '置信区间下界',
        type: 'line',
        data: lowerBounds.map(v => -v),
        lineStyle: { width: 0 },
        stack: 'confidence'
      }
    )
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: ['RMS振动值', '峰值', '预测值', '置信区间'],
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: { rotate: 45, fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      name: '振动值 (mm/s)',
      splitLine: { lineStyle: { type: 'dashed' } }
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100, height: 20, bottom: 5 }
    ],
    series: series,
    large: rmsData.length > 1000,
    largeThreshold: 1000
  }

  vibrationChart.scheduleUpdate(option)

  if (vibrationChart.on) {
    vibrationChart.on('dataZoom', (params) => {
      if (params.batch) {
        const startPercent = params.batch[0].start
        const endPercent = params.batch[0].end
        const totalLength = xData.length
        const startIdx = Math.floor(startPercent / 100 * totalLength)
        const endIdx = Math.ceil(endPercent / 100 * totalLength)
        if (endIdx - startIdx < 50 && activeDrillLevel.value < drillLevels.value.length - 1) {
          drillStore.zoomToRange(
            timestamps[startIdx].toISOString(),
            timestamps[Math.min(endIdx, timestamps.length - 1)].toISOString()
          )
        }
      }
    })
  }
}

function renderTrendChart(timestamps, rmsData, tempData) {
  if (!trendChart) return

  const xData = timestamps.map(t => t.toLocaleString())

  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['RMS', '温度'], top: 0 },
    grid: { left: '3%', right: '4%', bottom: '3%', top: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: { rotate: 45, fontSize: 9 }
    },
    yAxis: [
      { type: 'value', name: 'RMS' },
      { type: 'value', name: '温度 (°C)' }
    ],
    series: [
      {
        name: 'RMS',
        type: 'line',
        data: rmsData,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.5 }
      },
      {
        name: '温度',
        type: 'line',
        yAxisIndex: 1,
        data: tempData,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.5, color: '#F56C6C' }
      }
    ]
  }

  trendChart.setOption(option)
}

async function loadPrediction() {
  if (!selectedDevice.value) return

  predicting.value = true
  try {
    const res = await advancedApi.predictFault({
      device_code: selectedDevice.value,
      metric: 'rms',
      method: predictionMethod.value,
      forecast_steps: 48,
      hours_of_history: 168
    })

    if (res.success) {
      predictionResult.value = res.data
      processAndRenderCharts()
      renderSeverityChart()
      ElMessage.success('预测分析完成')
    }
  } catch (e) {
    ElMessage.error('预测失败: ' + (e.message || '未知错误'))
  } finally {
    predicting.value = false
  }
}

async function runEnsemblePrediction() {
  if (!selectedDevice.value) return

  ensemblePredicting.value = true
  try {
    const res = await advancedApi.predictEnsemble({
      device_code: selectedDevice.value,
      metric: 'rms',
      forecast_steps: 48,
      hours_of_history: 168
    })

    if (res.success) {
      predictionResult.value = res.data.ensemble
      processAndRenderCharts()
      renderSeverityChart()
      ElMessage.success('集成预测分析完成')
    }
  } catch (e) {
    ElMessage.error('集成预测失败: ' + (e.message || '未知错误'))
  } finally {
    ensemblePredicting.value = false
  }
}

function renderSeverityChart() {
  if (!severityChart) return

  const data = [
    { value: 10, name: '正常', itemStyle: { color: '#67C23A' } },
    { value: 5, name: '预警', itemStyle: { color: '#E6A23C' } },
    { value: 3, name: '告警', itemStyle: { color: '#F56C6C' } },
    { value: 1, name: '严重', itemStyle: { color: '#C00000' } }
  ]

  const option = {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', right: 10, top: 'center' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: false,
      label: { show: false },
      emphasis: {
        label: { show: true, fontSize: 14, fontWeight: 'bold' }
      },
      labelLine: { show: false },
      data: data
    }]
  }

  severityChart.setOption(option)
}

async function loadArchiveStats() {
  try {
    const res = await advancedApi.getArchiveStats()
    if (res.success) {
      archiveStats.value = res.data
    }
  } catch (e) {
    console.error('Load archive stats error:', e)
  }
}

async function runArchive() {
  try {
    await ElMessageBox.confirm(
      '确定要执行数据归档吗？这将把超过7天的数据移动到冷存储。',
      '确认归档',
      { type: 'warning' }
    )

    archiving.value = true
    const res = await advancedApi.runArchive({
      hot_data_days: 7,
      enable_csv_backup: true,
      enable_aggregation: true
    })

    if (res.success) {
      ElMessage.success(`归档完成，共处理 ${res.data.archived_count} 条记录`)
      loadArchiveStats()
      loadData()
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('归档失败: ' + (e.message || '未知错误'))
    }
  } finally {
    archiving.value = false
  }
}

function getTrendDirectionText(direction) {
  const map = {
    'increasing': '上升趋势',
    'decreasing': '下降趋势',
    'stable': '稳定'
  }
  return map[direction] || '未知'
}

function getSeverityText(severity) {
  const map = {
    'normal': '正常',
    'warning': '预警',
    'alert': '告警',
    'critical': '严重'
  }
  return map[severity] || '未知'
}

function getSeverityTagType(severity) {
  const map = {
    'normal': 'success',
    'warning': 'warning',
    'alert': 'danger',
    'critical': 'danger'
  }
  return map[severity] || 'info'
}

function getSeverityColor(severity) {
  const map = {
    'normal': '#67C23A',
    'warning': '#E6A23C',
    'alert': '#F56C6C',
    'critical': '#C00000'
  }
  return map[severity] || '#909399'
}

function getRULColor() {
  if (!predictionResult.value?.rul_prediction) return '#909399'
  const hours = predictionResult.value.rul_prediction.remaining_useful_life_hours
  if (hours < 24) return '#C00000'
  if (hours < 168) return '#F56C6C'
  if (hours < 720) return '#E6A23C'
  return '#67C23A'
}

function formatRUL(hours) {
  if (!isFinite(hours)) return '健康'
  if (hours < 0) return '已超时'
  if (hours < 24) return `${hours.toFixed(1)} 小时`
  if (hours < 720) return `${(hours / 24).toFixed(1)} 天`
  return `${(hours / 720).toFixed(1)} 月`
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN')
}

watch(() => selectedDevice.value, () => {
  predictionResult.value = null
})
</script>

<style scoped>
.deep-analysis-page {
  padding: 16px;
  background: #f5f7fa;
  min-height: 100vh;
}

.header-card {
  margin-bottom: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
}

.subtitle {
  margin: 0;
  color: #909399;
  font-size: 13px;
}

.control-row {
  margin-bottom: 16px;
  background: #fff;
  padding: 16px;
  border-radius: 8px;
}

.drill-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drill-label {
  color: #606266;
  font-size: 13px;
}

.drill-btn {
  margin-left: 8px;
}

.stats-row {
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 24px;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.stat-trend {
  font-size: 12px;
}

.chart-card {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.header-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-tools {
  display: flex;
  align-items: center;
}

.chart-container {
  height: 400px;
  width: 100%;
}

.chart-container.small-chart {
  height: 300px;
}

.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 4px;
  margin-top: 12px;
  font-size: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.multi-chart-row {
  margin-bottom: 16px;
}

.analysis-card {
  margin-bottom: 16px;
}

.alert-box {
  margin-top: 16px;
}

.diagnosis-suggestions {
  margin-top: 20px;
  padding: 16px;
  background: #f0f9ff;
  border-radius: 8px;
  border-left: 4px solid #409EFF;
}

.diagnosis-suggestions h4 {
  margin: 0 0 12px 0;
  color: #409EFF;
  display: flex;
  align-items: center;
  gap: 6px;
}

.diagnosis-suggestions ul {
  margin: 0;
  padding-left: 20px;
  color: #606266;
  line-height: 1.8;
}

.archive-card {
  margin-bottom: 16px;
}

.archive-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
