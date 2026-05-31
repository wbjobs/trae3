<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">振动分析</h2>
      <div class="header-actions">
        <el-tag v-if="queryStats.from_cache" type="success">来自缓存</el-tag>
        <el-tag v-else-if="queryStats.total_points" type="info">
          分析 {{ queryStats.analyzed_points?.toLocaleString() }} / {{ queryStats.total_points?.toLocaleString() }} 点
        </el-tag>
      </div>
    </div>

    <DataFilter
      :devices="devices"
      @query="handleQuery"
    />

    <div v-if="faultDiagnosis.fault_type && faultDiagnosis.fault_type !== 'normal'" class="diagnosis-banner">
      <el-alert
        :title="`故障诊断: ${getFaultTypeName(faultDiagnosis.fault_type)}`"
        :type="faultDiagnosis.severity === 'critical' ? 'error' : 'warning'"
        show-icon
        :closable="false"
      >
        <template #default>
          严重程度: {{ getSeverityLabel(faultDiagnosis.severity) }}
        </template>
      </el-alert>
    </div>

    <div class="stats-grid" v-if="analysisResult">
      <StatusCard
        label="X轴RMS"
        :value="formatValue(analysisResult.rms_x)"
        unit="mm/s"
        icon="DataLine"
        :status="analysisResult.rms_x > 5 ? 'warning' : 'success'"
      />
      <StatusCard
        label="Y轴RMS"
        :value="formatValue(analysisResult.rms_y)"
        unit="mm/s"
        icon="DataLine"
        :status="analysisResult.rms_y > 5 ? 'warning' : 'success'"
      />
      <StatusCard
        label="Z轴RMS"
        :value="formatValue(analysisResult.rms_z)"
        unit="mm/s"
        icon="DataLine"
        :status="analysisResult.rms_z > 5 ? 'warning' : 'success'"
      />
      <StatusCard
        label="平均温度"
        :value="formatValue(analysisResult.temperature_mean, 1)"
        unit="°C"
        icon="Warning"
        :status="analysisResult.temperature_mean > 60 ? 'warning' : 'success'"
      />
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="时域波形" name="time">
        <VibrationChart
          ref="vibrationChartRef"
          title="三轴振动波形"
          :x-data="timeLabels"
          :y-data="vibrationData"
          :annotations="chartAnnotations"
          :max-points="2000"
          @annotation-click="handleAnnotationClick"
          @chart-click="handleChartClick"
        />

        <div class="chart-container">
          <div class="chart-title">温度趋势</div>
          <VibrationChart
            title="温度变化"
            :x-data="timeLabels"
            :y-data="temperatureData"
            :max-points="500"
            type="line"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane label="频谱分析" name="frequency">
        <FFTChart
          title="FFT频谱分析"
          :frequencies="frequencies"
          :magnitudes="fftData"
        />
      </el-tab-pane>
      <el-tab-pane label="统计特征" name="stats">
        <div class="chart-container">
          <div class="chart-title">统计特征参数</div>
          <el-table :data="featureData" stripe>
            <el-table-column prop="feature" label="特征参数" width="150" />
            <el-table-column prop="x" label="X轴" />
            <el-table-column prop="y" label="Y轴" />
            <el-table-column prop="z" label="Z轴" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'normal' ? 'success' : 'warning'" size="small">
                  {{ row.status === 'normal' ? '正常' : '异常' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <div class="chart-container" v-if="anomalies.length > 0">
      <div class="chart-title">
        <span>检测到的异常 ({{ anomalies.length }}条)</span>
        <div class="legend-demo">
          <span class="legend-item"><i class="legend-dot" style="background: #f56c6c"></i>严重</span>
          <span class="legend-item"><i class="legend-dot" style="background: #e6a23c"></i>警告</span>
        </div>
      </div>
      <el-table :data="anomalies" stripe @row-click="handleAnomalyRowClick">
        <el-table-column prop="timestamp" label="时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.timestamp) }}
          </template>
        </el-table-column>
        <el-table-column prop="anomaly_type" label="异常类型" width="180">
          <template #default="{ row }">
            {{ getAnomalyTypeName(row.anomaly_type) }}
          </template>
        </el-table-column>
        <el-table-column prop="axis" label="轴向" width="80" />
        <el-table-column prop="severity" label="严重程度" width="100">
          <template #default="{ row }">
            <el-tag :type="getSeverityType(row.severity)" size="small">
              {{ getSeverityLabel(row.severity) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="value" label="数值" width="120">
          <template #default="{ row }">
            {{ row.value?.toFixed(4) }}
          </template>
        </el-table-column>
        <el-table-column prop="threshold" label="阈值" width="120">
          <template #default="{ row }">
            {{ row.threshold?.toFixed(4) }}
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="200" />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import DataFilter from '@/components/DataFilter.vue'
import VibrationChart from '@/components/VibrationChart.vue'
import FFTChart from '@/components/FFTChart.vue'
import StatusCard from '@/components/StatusCard.vue'
import { deviceApi, vibrationApi } from '@/api'
import { vibrationDataCache } from '@/utils/dataSampler'
import dayjs from 'dayjs'

const devices = ref([])
const activeTab = ref('time')
const vibrationChartRef = ref(null)
const analysisResult = ref(null)
const timeLabels = ref([])
const vibrationData = ref({ 'X轴': [], 'Y轴': [], 'Z轴': [] })
const temperatureData = ref({ '温度': [] })
const frequencies = ref([])
const fftData = ref({ 'X轴': [], 'Y轴': [], 'Z轴': [] })
const featureData = ref([])
const anomalies = ref([])
const chartAnnotations = ref([])
const faultDiagnosis = reactive({
  fault_type: 'normal',
  severity: 'normal'
})
const queryStats = reactive({
  from_cache: false,
  analyzed_points: 0,
  total_points: 0
})

const formatValue = (value, decimals = 4) => {
  if (value === null || value === undefined || isNaN(value)) return '-'
  return value.toFixed(decimals)
}

const formatTime = (time) => {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

const getSeverityType = (severity) => {
  const map = { critical: 'danger', warning: 'warning', info: 'info' }
  return map[severity] || 'info'
}

const getSeverityLabel = (severity) => {
  const map = { critical: '严重', warning: '警告', info: '一般', normal: '正常' }
  return map[severity] || '一般'
}

const getAnomalyTypeName = (type) => {
  const map = {
    multi_feature_alarm: '多指标严重超标',
    multi_feature_warning: '多指标超标',
    impulse_cluster: '连续冲击信号',
    severe_harmonic_distortion: '严重谐波失真',
    rapid_deterioration: '快速劣化',
    deterioration_trend: '劣化趋势',
    overheat: '过热',
    outlier: '离群点',
    harmonic_distortion: '谐波失真',
    rms_exceeded: 'RMS超标',
    peak_exceeded: '峰值超标',
    high_impulse: '冲击信号',
    frequency_deviation: '频率偏移'
  }
  return map[type] || type
}

const getFaultTypeName = (type) => {
  const map = {
    bearing_damage: '轴承损坏',
    early_bearing_wear: '早期轴承磨损',
    rapid_deterioration: '快速劣化',
    severe_impact: '严重冲击',
    intermittent_impact: '间歇性冲击',
    gradual_deterioration: '渐进式劣化',
    gear_meshing_issue: '齿轮啮合问题',
    lubrication_issue: '润滑问题',
    abnormal_operation: '异常运行',
    imbalance: '不平衡',
    normal: '正常'
  }
  return map[type] || type
}

const loadDevices = async () => {
  try {
    const data = await deviceApi.getDevices()
    devices.value = data || []
  } catch (error) {
    console.error('Failed to load devices:', error)
  }
}

const generateAnnotations = (anomalyList, timeArray) => {
  const annotations = []
  const timeSet = new Set(timeArray)
  const timeIndex = new Map(timeArray.map((t, i) => [t, i]))

  anomalyList.forEach((anomaly, idx) => {
    const anomalyTime = formatTime(anomaly.timestamp)
    const color = anomaly.severity === 'critical' ? '#f56c6c' : '#e6a23c'

    let dataIndex = -1
    if (timeIndex.has(anomalyTime)) {
      dataIndex = timeIndex.get(anomalyTime)
    } else {
      const parsedTime = dayjs(anomaly.timestamp)
      for (let i = 0; i < timeArray.length; i++) {
        const diff = Math.abs(dayjs(timeArray[i], 'HH:mm:ss').diff(parsedTime, 'second'))
        if (diff < 2) {
          dataIndex = i
          break
        }
      }
    }

    if (dataIndex >= 0) {
      annotations.push({
        type: 'point',
        x: timeArray[dataIndex],
        y: anomaly.value || 0,
        axis: anomaly.axis,
        label: getAnomalyTypeName(anomaly.anomaly_type),
        color: color,
        anomalyData: anomaly
      })
    }

    if (anomaly.anomaly_type === 'deterioration_trend' || anomaly.anomaly_type === 'rapid_deterioration') {
      const startIdx = Math.max(0, dataIndex - 50)
      const endIdx = Math.min(timeArray.length - 1, dataIndex + 10)
      if (startIdx < endIdx) {
        annotations.push({
          type: 'range',
          x1: timeArray[startIdx],
          x2: timeArray[endIdx],
          label: '劣化区间',
          color: '#f56c6c'
        })
      }
    }
  })

  const rmsThreshold = 5.0
  annotations.push({
    type: 'threshold',
    value: rmsThreshold,
    label: 'RMS预警阈值',
    color: '#e6a23c'
  })

  return annotations
}

const handleQuery = async (params) => {
  if (!params.device_code || !params.start_time || !params.end_time) {
    ElMessage.warning('请选择设备和时间范围')
    return
  }

  const loading = ElMessage.loading({
    message: '正在分析数据...',
    duration: 0
  })

  try {
    const cachedResult = vibrationDataCache.get(params)
    if (cachedResult) {
      queryStats.from_cache = true
      applyAnalysisResult(cachedResult)
      loading.close()
      ElMessage.success('加载缓存数据成功')
      return
    }

    const result = await vibrationApi.detectAnomalies(params)
    queryStats.from_cache = result.from_cache || false
    queryStats.analyzed_points = result.analyzed_points || 0
    queryStats.total_points = result.total_points || 0

    analysisResult.value = result.analysis
    anomalies.value = result.anomalies || []

    if (result.fault_diagnosis) {
      faultDiagnosis.fault_type = result.fault_diagnosis.fault_type
      faultDiagnosis.severity = result.fault_diagnosis.severity
    }

    let rawDataResponse = await vibrationApi.getData({
      ...params,
      limit: 10000,
      use_sampling: true
    })

    let rawData = []
    if (rawDataResponse.sampled) {
      rawData = rawDataResponse.data
    } else if (rawDataResponse.data) {
      rawData = rawDataResponse.data
    } else {
      rawData = rawDataResponse
    }

    if (rawData.length === 0) {
      loading.close()
      ElMessage.warning('未查询到数据，请调整时间范围')
      return
    }

    timeLabels.value = rawData.map(d => dayjs(d.timestamp).format('HH:mm:ss'))
    vibrationData.value = {
      'X轴': rawData.map(d => d.x_axis),
      'Y轴': rawData.map(d => d.y_axis),
      'Z轴': rawData.map(d => d.z_axis)
    }
    temperatureData.value = {
      '温度': rawData.map(d => d.temperature || 0)
    }

    if (analysisResult.value.fft_data) {
      const fft = analysisResult.value.fft_data
      frequencies.value = fft.x?.frequencies || []
      fftData.value = {
        'X轴': fft.x?.magnitudes || [],
        'Y轴': fft.y?.magnitudes || [],
        'Z轴': fft.z?.magnitudes || []
      }
    }

    const checkStatus = (value, warning, alarm) => {
      if (value > alarm) return 'abnormal'
      if (value > warning) return 'warning'
      return 'normal'
    }

    featureData.value = [
      { feature: 'RMS值', x: formatValue(analysisResult.value.rms_x), y: formatValue(analysisResult.value.rms_y), z: formatValue(analysisResult.value.rms_z), status: checkStatus(Math.max(analysisResult.value.rms_x, analysisResult.value.rms_y, analysisResult.value.rms_z), 5, 10) },
      { feature: '峰值', x: formatValue(analysisResult.value.peak_x), y: formatValue(analysisResult.value.peak_y), z: formatValue(analysisResult.value.peak_z), status: checkStatus(Math.max(analysisResult.value.peak_x, analysisResult.value.peak_y, analysisResult.value.peak_z), 15, 25) },
      { feature: '峭度', x: formatValue(analysisResult.value.kurtosis_x), y: formatValue(analysisResult.value.kurtosis_y), z: formatValue(analysisResult.value.kurtosis_z), status: checkStatus(Math.max(analysisResult.value.kurtosis_x, analysisResult.value.kurtosis_y, analysisResult.value.kurtosis_z), 4, 8) },
      { feature: '偏度', x: formatValue(analysisResult.value.skewness_x), y: formatValue(analysisResult.value.skewness_y), z: formatValue(analysisResult.value.skewness_z), status: 'normal' },
      { feature: '波峰因数', x: formatValue(analysisResult.value.crest_factor_x), y: formatValue(analysisResult.value.crest_factor_y), z: formatValue(analysisResult.value.crest_factor_z), status: checkStatus(Math.max(analysisResult.value.crest_factor_x, analysisResult.value.crest_factor_y, analysisResult.value.crest_factor_z), 6, 10) },
      { feature: '主频(Hz)', x: formatValue(analysisResult.value.dominant_frequency_x, 2), y: formatValue(analysisResult.value.dominant_frequency_y, 2), z: formatValue(analysisResult.value.dominant_frequency_z, 2), status: 'normal' }
    ]

    chartAnnotations.value = generateAnnotations(anomalies.value, timeLabels.value)

    vibrationDataCache.set(params, {
      analysis: analysisResult.value,
      anomalies: anomalies.value,
      rawData: rawData,
      fault_diagnosis: { ...faultDiagnosis }
    })

    loading.close()
    ElMessage.success('分析完成')
  } catch (error) {
    loading.close()
    console.error('Analysis error:', error)
    ElMessage.error('分析失败: ' + (error.response?.data?.detail || error.message))
  }
}

const applyAnalysisResult = (cached) => {
  analysisResult.value = cached.analysis
  anomalies.value = cached.anomalies
  if (cached.fault_diagnosis) {
    faultDiagnosis.fault_type = cached.fault_diagnosis.fault_type
    faultDiagnosis.severity = cached.fault_diagnosis.severity
  }

  const rawData = cached.rawData || []
  timeLabels.value = rawData.map(d => dayjs(d.timestamp).format('HH:mm:ss'))
  vibrationData.value = {
    'X轴': rawData.map(d => d.x_axis),
    'Y轴': rawData.map(d => d.y_axis),
    'Z轴': rawData.map(d => d.z_axis)
  }
  temperatureData.value = {
    '温度': rawData.map(d => d.temperature || 0)
  }

  if (analysisResult.value.fft_data) {
    const fft = analysisResult.value.fft_data
    frequencies.value = fft.x?.frequencies || []
    fftData.value = {
      'X轴': fft.x?.magnitudes || [],
      'Y轴': fft.y?.magnitudes || [],
      'Z轴': fft.z?.magnitudes || []
    }
  }

  chartAnnotations.value = generateAnnotations(anomalies.value, timeLabels.value)
}

const handleAnnotationClick = (annotation) => {
  if (annotation.anomalyData) {
    ElMessage.info(`选中异常: ${annotation.label}`)
  }
}

const handleChartClick = (params) => {
  console.log('Chart clicked:', params)
}

const handleAnomalyRowClick = (row) => {
  const annotations = chartAnnotations.value.filter(
    a => a.anomalyData && a.anomalyData.timestamp === row.timestamp
  )
  if (annotations.length > 0 && vibrationChartRef.value) {
    vibrationChartRef.value.focusAnnotation(annotations[0])
  }
}

onMounted(() => {
  loadDevices()
})
</script>

<style scoped>
.header-actions {
  display: flex;
  gap: 12px;
}

.diagnosis-banner {
  margin-bottom: 24px;
}

.legend-demo {
  display: flex;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #666;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
</style>
