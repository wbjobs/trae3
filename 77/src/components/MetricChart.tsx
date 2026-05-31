import { useEffect, useRef, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption, ComposeOption, LinesSeriesOption, LineSeriesOption } from 'echarts';
import type { MetricData, AggregatedData, MetricDefinition } from '@/types';
import { formatTime, formatDateTime } from '@/utils/time';
import { getMetricColor } from '@/utils/format';

interface MetricChartProps {
  metric: MetricDefinition;
  data: MetricData[] | AggregatedData[];
  height?: number;
  showLegend?: boolean;
}

interface ChartPoint {
  time: number;
  value: number;
  min?: number;
  max?: number;
  anomaly: boolean;
}

const MAX_DISPLAY_POINTS = 500;

function lttbDownsample(data: ChartPoint[], threshold: number): ChartPoint[] {
  if (data.length <= threshold || threshold <= 2) {
    return data;
  }

  const sampled: ChartPoint[] = [];
  const bucketSize = (data.length - 2) / (threshold - 2);

  sampled.push(data[0]);

  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    const actualAvgEnd = Math.min(avgRangeEnd, data.length);

    let avgX = 0;
    let avgY = 0;
    const avgRangeLength = actualAvgEnd - avgRangeStart;
    for (let j = avgRangeStart; j < actualAvgEnd; j++) {
      avgX += data[j].time;
      avgY += data[j].value;
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    const rangeOff = Math.floor((i) * bucketSize) + 1;
    const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

    const pointA = data[a];
    let maxAreaPoint = data[rangeOff];
    let maxArea = -1;

    for (let j = rangeOff; j < rangeTo; j++) {
      const area = Math.abs(
        (pointA.time - avgX) * (data[j].value - pointA.value) -
        (pointA.time - data[j].time) * (avgY - pointA.value)
      ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[j];
        a = j;
      }
    }

    sampled.push(maxAreaPoint);
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}

function deduplicateAndSort(data: ChartPoint[]): ChartPoint[] {
  const map = new Map<number, ChartPoint>();
  for (const point of data) {
    const existing = map.get(point.time);
    if (!existing || point.anomaly) {
      map.set(point.time, point);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

export default function MetricChart({
  metric,
  data,
  height = 300,
  showLegend = true,
}: MetricChartProps) {
  const chartRef = useRef<ReactECharts>(null);
  const [isAggregated, setIsAggregated] = useState(false);

  useEffect(() => {
    if (data.length > 0) {
      setIsAggregated('time_bucket' in data[0]);
    }
  }, [data]);

  const color = getMetricColor(metric.name);

  const { chartData, anomalyPoints } = useMemo(() => {
    const rawData: ChartPoint[] = isAggregated
      ? (data as AggregatedData[]).map((d) => ({
          time: d.time_bucket,
          value: d.avg_val,
          min: d.min_val,
          max: d.max_val,
          anomaly: d.anomaly_count > 0,
        }))
      : (data as MetricData[]).map((d) => ({
          time: d.timestamp,
          value: d.value,
          anomaly: d.is_anomaly === 1,
        }));

    const sortedData = deduplicateAndSort(rawData);
    const displayData = lttbDownsample(sortedData, MAX_DISPLAY_POINTS);

    const anomalyPoints = displayData
      .filter((d) => d.anomaly)
      .map((d) => ({
        name: '异常',
        coord: [d.time, d.value] as [number, number],
        value: d.value,
      }));

    return { chartData: displayData, anomalyPoints };
  }, [data, isAggregated]);

  const markLines: any[] = useMemo(() => {
    const lines: any[] = [];
    if (metric.warn_threshold) {
      lines.push({
        yAxis: metric.warn_threshold,
        lineStyle: { color: '#f59e0b', type: 'dashed', width: 1 },
        label: {
          formatter: '警告阈值',
          color: '#f59e0b',
          fontSize: 10,
          position: 'insideEndTop',
        },
      });
    }
    if (metric.crit_threshold) {
      lines.push({
        yAxis: metric.crit_threshold,
        lineStyle: { color: '#ef4444', type: 'dashed', width: 1 },
        label: {
          formatter: '临界阈值',
          color: '#ef4444',
          fontSize: 10,
          position: 'insideEndTop',
        },
      });
    }
    return lines;
  }, [metric.warn_threshold, metric.crit_threshold]);

  const option: ComposeOption<LineSeriesOption> = useMemo(() => ({
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(6, 182, 212, 0.3)',
      borderWidth: 1,
      textStyle: { color: '#fff' },
      axisPointer: {
        type: 'cross',
        label: { backgroundColor: '#06b6d4' },
        lineStyle: { color: '#06b6d4', width: 1, type: 'dashed' },
      },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const time = p.axisValue;
        const formattedTime = isAggregated
          ? formatDateTime(time as number)
          : formatTime(time as number);
        const value = p.data?.[1] ?? p.value;
        return `<div style="font-family: 'JetBrains Mono', monospace;">
          <div style="color: #94a3b8; margin-bottom: 4px;">${formattedTime}</div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 10px; height: 10px; background: ${color}; border-radius: 2px;"></span>
            <span>${metric.display_name}: <strong style="color: ${color};">${Number(value).toFixed(2)}${metric.unit || ''}</strong></span>
          </div>
        </div>`;
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: showLegend ? '12%' : '8%',
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11,
        formatter: (value: number) => isAggregated ? formatDateTime(value) : formatTime(value),
      },
      splitLine: { show: false },
      min: 'dataMin',
      max: 'dataMax',
    },
    yAxis: {
      type: 'value',
      name: metric.unit,
      nameTextStyle: { color: '#64748b', fontSize: 11 },
      axisLine: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1e293b', width: 0.5 } },
      scale: true,
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100,
        zoomOnMouseWheel: 'ctrl',
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
    ],
    series: [
      {
        name: metric.display_name,
        type: 'line',
        smooth: 0.3,
        symbol: 'circle',
        symbolSize: 4,
        showSymbol: false,
        data: chartData.map((d) => [d.time, d.value] as [number, number]),
        lineStyle: { width: 2, color },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}30` },
              { offset: 1, color: `${color}05` },
            ],
          },
        },
        large: true,
        largeThreshold: 100,
        sampling: 'lttb',
        emphasis: {
          focus: 'series',
          lineStyle: { width: 3 },
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: markLines,
        },
        markPoint: {
          symbol: 'pin',
          symbolSize: 14,
          data: anomalyPoints,
          itemStyle: { color: '#ef4444' },
          label: { show: false },
        },
      },
    ],
  }), [chartData, anomalyPoints, markLines, metric, color, isAggregated, showLegend]);

  return (
    <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium">{metric.display_name}</h3>
          <p className="text-xs text-gray-500">
            {data.length} 个数据点{data.length > MAX_DISPLAY_POINTS && ` (显示 ${MAX_DISPLAY_POINTS} 点)`}
          </p>
        </div>
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
        />
      </div>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
}
