import { useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Card, Spin, Empty } from 'antd';
import { HEATMAP_COLORS } from '@/constants';
import { isEmpty } from '@/utils';

interface HeatmapDataPoint {
  row: number;
  col: number;
  value: number;
  componentId: string;
  faultTypes?: string[];
}

interface HeatmapChartProps {
  title?: string;
  data: HeatmapDataPoint[];
  rows: number;
  cols: number;
  loading?: boolean;
  height?: number;
  onCellClick?: (data: HeatmapDataPoint) => void;
}

const faultTypeColors: Record<string, string> = {
  voltage_abnormal: '#1677ff',
  current_abnormal: '#722ed1',
  temperature_high: '#ff4d4f',
  offline: '#52525b',
  short_circuit: '#faad14',
};

function safeHeatmapData(data?: HeatmapDataPoint[]): HeatmapDataPoint[] {
  if (!Array.isArray(data)) return [];
  return data.filter(item =>
    item &&
    typeof item === 'object' &&
    typeof item.row === 'number' &&
    typeof item.col === 'number' &&
    typeof item.value === 'number' &&
    !isNaN(item.value) &&
    isFinite(item.value) &&
    typeof item.componentId === 'string'
  ).map(item => ({
    ...item,
    value: Math.max(0, item.value),
    row: Math.floor(item.row),
    col: Math.floor(item.col),
  }));
}

export default function HeatmapChart({
  title,
  data,
  rows,
  cols,
  loading = false,
  height = 400,
  onCellClick,
}: HeatmapChartProps) {
  const safeData = useMemo(() => safeHeatmapData(data), [data]);
  const hasData = useMemo(() => !isEmpty(safeData), [safeData]);

  const getOption = useCallback((): EChartsOption => {
    const chartData: [number, number, number][] = [];
    let maxValue = 0;

    const dataMap = new Map<string, HeatmapDataPoint>();

    safeData.forEach((item) => {
      if (item.row >= 0 && item.row < rows && item.col >= 0 && item.col < cols) {
        chartData.push([item.col, item.row, item.value]);
        dataMap.set(`${item.row}_${item.col}`, item);
        if (item.value > maxValue) maxValue = item.value;
      }
    });

    const rowLabels = Array.from({ length: rows }, (_, i) => `R${i + 1}`);
    const colLabels = Array.from({ length: cols }, (_, i) => `C${i + 1}`);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top',
        backgroundColor: 'rgba(31, 31, 31, 0.95)',
        borderColor: '#3f3f46',
        textStyle: {
          color: '#e5e7eb',
        },
        formatter: (params: any) => {
          if (!params || !params.data || params.data.length < 3) return '';
          const key = `${params.data[1]}_${params.data[0]}`;
          const point = dataMap.get(key);
          if (!point) return '';
          let html = `<div style="font-weight: 500; margin-bottom: 8px;">${point.componentId}</div>`;
          html += `<div>位置: (${point.row + 1}, ${point.col + 1})</div>`;
          html += `<div>故障数: ${point.value}</div>`;
          if (point.faultTypes && point.faultTypes.length > 0) {
            html += `<div style="margin-top: 8px;">故障类型:</div>`;
            point.faultTypes.forEach((type) => {
              const color = faultTypeColors[type] || '#71717a';
              const typeLabel = type.replace(/_/g, ' ');
              html += `<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
                <span>${typeLabel}</span>
              </div>`;
            });
          }
          return html;
        },
      },
      grid: {
        left: 60,
        right: 40,
        top: 50,
        bottom: 40,
      },
      xAxis: {
        type: 'category',
        data: colLabels,
        splitArea: { show: true },
        axisLabel: {
          color: '#71717a',
          fontSize: 10,
          interval: Math.max(0, Math.floor(cols / 10) - 1),
        },
        axisLine: {
          lineStyle: { color: '#3f3f46' },
        },
      },
      yAxis: {
        type: 'category',
        data: rowLabels,
        splitArea: { show: true },
        axisLabel: {
          color: '#71717a',
          fontSize: 10,
          interval: Math.max(0, Math.floor(rows / 10) - 1),
        },
        axisLine: {
          lineStyle: { color: '#3f3f46' },
        },
      },
      visualMap: {
        min: 0,
        max: Math.max(maxValue, 1),
        calculable: true,
        orient: 'vertical',
        right: 10,
        top: 'center',
        inRange: {
          color: HEATMAP_COLORS,
        },
        textStyle: {
          color: '#71717a',
        },
        precision: 0,
      },
      series: [
        {
          name: '故障热力图',
          type: 'heatmap',
          data: chartData,
          label: {
            show: false,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          progressive: 1000,
          progressiveThreshold: 5000,
          ...(chartData.length > 2000 ? { large: true } : {}),
        },
      ],
    };
  }, [safeData, rows, cols]);

  const handleClick = useCallback((params: any) => {
    if (!onCellClick || !params || !params.data || params.data.length < 3) return;
    const key = `${params.data[1]}_${params.data[0]}`;
    const dataMap = new Map(safeData.map(d => [`${d.row}_${d.col}`, d]));
    const point = dataMap.get(key);
    if (point) onCellClick(point);
  }, [safeData, onCellClick]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center" style={{ height: height - 20 }}>
          <Spin size="large" />
        </div>
      );
    }

    if (!hasData) {
      return (
        <div className="flex items-center justify-center" style={{ height: height - 20 }}>
          <Empty
            description="暂无数据"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      );
    }

    return (
      <ReactECharts
        option={getOption()}
        style={{ height, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        onEvents={{ click: handleClick }}
        notMerge={false}
        lazyUpdate={true}
      />
    );
  };

  return (
    <Card
      className="bg-zinc-900 border-zinc-800"
      styles={{ body: { padding: 0 } }}
      title={title}
    >
      {renderContent()}
    </Card>
  );
}
