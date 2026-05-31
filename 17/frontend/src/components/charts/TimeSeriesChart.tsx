import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { EChartsInstance } from 'echarts-for-react';
import { Card, Spin, Select, Badge, Tooltip, Empty } from 'antd';
import { throttle } from 'lodash-es';
import type { TimeSeriesPoint, ChartMarkLine, ChartMarkPoint, ChartMarkArea } from '@/types';
import { CHART_COLORS, LARGE_DATA_THRESHOLD, LTTB_SAMPLE_SIZE } from '@/constants';
import { formatTimeSeriesData, hasValidData, lttbDownsample } from '@/utils/chartUtils';

interface TimeSeriesChartProps {
  title?: string;
  data: Record<string, TimeSeriesPoint[]>;
  loading?: boolean;
  colors?: string[];
  height?: number;
  showLegend?: boolean;
  yAxisName?: string;
  unit?: string;
  enableLargeThreshold?: number;
  markLine?: ChartMarkLine[];
  markPoint?: ChartMarkPoint[];
  markArea?: ChartMarkArea[];
  onChartReady?: (instance: any) => void;
  onDataZoom?: (start: number, end: number) => void;
}

export default function TimeSeriesChart({
  title,
  data,
  loading = false,
  colors = CHART_COLORS,
  height = 350,
  showLegend = true,
  yAxisName = '数值',
  unit = '',
  enableLargeThreshold = LARGE_DATA_THRESHOLD,
  markLine,
  markPoint,
  markArea,
  onChartReady,
  onDataZoom,
}: TimeSeriesChartProps) {
  const chartRef = useRef<any>(null);
  const prevOptionRef = useRef<EChartsOption | null>(null);
  const [sampling, setSampling] = useState<'none' | 'lttb' | 'average'>('average');

  const isValidData = useMemo(() => hasValidData(data), [data]);

  const totalDataPoints = useMemo(() => {
    if (!data || typeof data !== 'object') return 0;
    return Object.values(data).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
  }, [data]);

  const processedData = useMemo(() => {
    const result: Record<string, [number, number][]> = {};
    if (!data || typeof data !== 'object') return result;

    Object.keys(data).forEach((componentId) => {
      const points = data[componentId];
      if (Array.isArray(points)) {
        result[componentId] = formatTimeSeriesData(
          points,
          sampling,
          LTTB_SAMPLE_SIZE
        );
      }
    });

    return result;
  }, [data, sampling]);

  const isLargeDataset = totalDataPoints > enableLargeThreshold;

  const buildMarkLineConfig = useCallback(() => {
    if (!markLine || markLine.length === 0) return undefined;
    return {
      symbol: 'none',
      data: markLine.map((item) => ({
        ...(item.xAxis !== undefined ? { xAxis: item.xAxis } : {}),
        ...(item.yAxis !== undefined ? { yAxis: item.yAxis } : {}),
        name: item.name || '',
        lineStyle: {
          color: item.color || '#ff4d4f',
          type: 'dashed' as const,
          width: 2,
          ...item.lineStyle,
        },
        label: {
          show: true,
          position: 'insideEndTop' as const,
          formatter: item.name || '',
          color: item.color || '#ff4d4f',
          fontSize: 11,
          ...item.label,
        },
      })),
    };
  }, [markLine]);

  const buildMarkPointConfig = useCallback(() => {
    if (!markPoint || markPoint.length === 0) return undefined;
    return {
      symbol: 'pin',
      symbolSize: 40,
      data: markPoint.map((item) => ({
        ...(item.coord ? { coord: item.coord } : {}),
        name: item.name || '',
        value: item.value,
        symbol: item.symbol || 'pin',
        symbolSize: item.symbolSize || 40,
        itemStyle: {
          color: '#ff4d4f',
          ...item.itemStyle,
        },
        label: {
          show: true,
          fontSize: 10,
          ...item.label,
        },
      })),
    };
  }, [markPoint]);

  const buildMarkAreaConfig = useCallback(() => {
    if (!markArea || markArea.length === 0) return undefined;
    return {
      data: markArea.map((area) => [
        {
          ...(area.start.xAxis !== undefined ? { xAxis: area.start.xAxis } : {}),
          ...(area.start.yAxis !== undefined ? { yAxis: area.start.yAxis } : {}),
          name: area.start.name || '',
          itemStyle: {
            color: area.start.color || '#ff4d4f15',
          },
        },
        {
          ...(area.end.xAxis !== undefined ? { xAxis: area.end.xAxis } : {}),
          ...(area.end.yAxis !== undefined ? { yAxis: area.end.yAxis } : {}),
        },
      ]),
    };
  }, [markArea]);

  const getOption = useCallback((): EChartsOption => {
    const series: any[] = [];
    const componentIds = Object.keys(processedData);

    componentIds.forEach((componentId, index) => {
      const chartData = processedData[componentId] || [];

      series.push({
        name: componentId,
        type: 'line',
        smooth: !isLargeDataset,
        symbol: isLargeDataset ? 'none' : 'circle',
        symbolSize: isLargeDataset ? 0 : 4,
        sampling: sampling === 'none' ? 'none' : (isLargeDataset ? 'lttb' : 'average'),
        lineStyle: {
          width: isLargeDataset ? 1 : 2,
          color: colors[index % colors.length],
          opacity: 0.9,
        },
        itemStyle: {
          color: colors[index % colors.length],
        },
        areaStyle: componentIds.length === 1 && !isLargeDataset ? {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: colors[index % colors.length] + '30' },
              { offset: 1, color: colors[index % colors.length] + '00' },
            ],
          },
        } : undefined,
        data: chartData,
        markLine: index === 0 ? buildMarkLineConfig() : undefined,
        markPoint: index === 0 ? buildMarkPointConfig() : undefined,
        markArea: index === 0 ? buildMarkAreaConfig() : undefined,
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 3,
          },
        },
        large: isLargeDataset,
        largeThreshold: enableLargeThreshold,
        progressive: isLargeDataset ? 5000 : 0,
        progressiveThreshold: isLargeDataset ? 10000 : 0,
        animation: !isLargeDataset,
        animationDuration: isLargeDataset ? 0 : 300,
        animationEasing: 'linear',
      });
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(31, 31, 31, 0.95)',
        borderColor: '#3f3f46',
        textStyle: {
          color: '#e5e7eb',
        },
        axisPointer: {
          type: 'cross',
          lineStyle: {
            color: '#52c41a',
            type: 'dashed',
          },
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const date = new Date(params[0].axisValue);
          let html = `<div style="font-weight: 500; margin-bottom: 8px;">${date.toLocaleString()}</div>`;
          params.forEach((item: any) => {
            if (item && item.value && typeof item.value[1] === 'number') {
              html += `<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: ${item.color};"></span>
                <span>${item.seriesName}:</span>
                <span style="font-weight: 500;">${item.value[1].toFixed(2)} ${unit}</span>
              </div>`;
            }
          });
          return html;
        },
      },
      legend: showLegend ? {
        data: componentIds,
        top: 10,
        right: 16,
        textStyle: {
          color: '#a1a1aa',
        },
        type: 'scroll',
        pageIconColor: '#1677ff',
        pageTextStyle: {
          color: '#a1a1aa',
        },
      } : undefined,
      grid: {
        left: 60,
        right: 20,
        top: showLegend ? 60 : 40,
        bottom: 40,
      },
      xAxis: {
        type: 'time',
        axisLine: {
          lineStyle: {
            color: '#3f3f46',
          },
        },
        axisLabel: {
          color: '#71717a',
          fontSize: 11,
        },
        splitLine: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        name: yAxisName,
        nameTextStyle: {
          color: '#71717a',
          fontSize: 11,
        },
        axisLine: {
          show: false,
        },
        axisLabel: {
          color: '#71717a',
          fontSize: 11,
          formatter: (value: number) => `${value.toFixed(1)}`,
        },
        splitLine: {
          lineStyle: {
            color: '#27272a',
            type: 'dashed',
          },
        },
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
          throttle: 100,
        },
        {
          type: 'slider',
          height: 24,
          bottom: 8,
          start: 0,
          end: 100,
          throttle: 100,
          borderColor: 'transparent',
          backgroundColor: '#27272a',
          fillerColor: '#1677ff30',
          handleStyle: {
            color: '#1677ff',
          },
          textStyle: {
            color: '#71717a',
          },
        },
      ],
      series,
    };
  }, [processedData, sampling, showLegend, yAxisName, unit, colors, isLargeDataset, enableLargeThreshold, buildMarkLineConfig, buildMarkPointConfig, buildMarkAreaConfig]);

  const getEchartsInstance = useCallback((): EChartsInstance | null => {
    if (!chartRef.current) return null;
    return chartRef.current.getEchartsInstance?.() ?? null;
  }, []);

  const appendData = useCallback((newData: Record<string, TimeSeriesPoint[]>) => {
    const instance = getEchartsInstance();
    if (!instance) return;

    Object.keys(newData).forEach((componentId, index) => {
      const points = newData[componentId];
      if (!Array.isArray(points) || points.length === 0) return;
      const formatted = formatTimeSeriesData(points, sampling, LTTB_SAMPLE_SIZE);
      instance.appendData({
        seriesIndex: index,
        data: formatted,
      });
    });
  }, [getEchartsInstance, sampling]);

  const mergeOption = useCallback((partialOption: Partial<EChartsOption>) => {
    const instance = getEchartsInstance();
    if (!instance) return;
    instance.setOption(partialOption, { notMerge: false, lazyUpdate: true });
  }, [getEchartsInstance]);

  const dispatchAction = useCallback((action: { type: string; [key: string]: any }) => {
    const instance = getEchartsInstance();
    if (!instance) return;
    instance.dispatchAction(action);
  }, [getEchartsInstance]);

  useEffect(() => {
    const throttledResize = throttle(() => {
      const instance = getEchartsInstance();
      instance?.resize();
    }, 200);

    window.addEventListener('resize', throttledResize);
    return () => {
      window.removeEventListener('resize', throttledResize);
      throttledResize.cancel();
    };
  }, [getEchartsInstance]);

  useEffect(() => {
    const instance = getEchartsInstance();
    if (instance && onChartReady) {
      onChartReady(instance);
    }
  }, [getEchartsInstance, onChartReady]);

  useEffect(() => {
    const instance = getEchartsInstance();
    if (!instance || !onDataZoom) return;

    const handler = (params: any) => {
      if (params?.batch?.[0]) {
        onDataZoom(params.batch[0].start, params.batch[0].end);
      }
    };

    instance.on('datazoom', handler);
    return () => {
      instance.off('datazoom', handler);
    };
  }, [getEchartsInstance, onDataZoom]);

  useEffect(() => {
    const instance = getEchartsInstance();
    if (!instance || !markLine || markLine.length === 0) return;

    instance.setOption({
      series: [{
        markLine: buildMarkLineConfig(),
      }],
    }, { notMerge: false, lazyUpdate: true });
  }, [markLine, getEchartsInstance, buildMarkLineConfig]);

  useEffect(() => {
    const instance = getEchartsInstance();
    if (!instance || !markPoint || markPoint.length === 0) return;

    instance.setOption({
      series: [{
        markPoint: buildMarkPointConfig(),
      }],
    }, { notMerge: false, lazyUpdate: true });
  }, [markPoint, getEchartsInstance, buildMarkPointConfig]);

  useEffect(() => {
    const instance = getEchartsInstance();
    if (!instance || !markArea || markArea.length === 0) return;

    instance.setOption({
      series: [{
        markArea: buildMarkAreaConfig(),
      }],
    }, { notMerge: false, lazyUpdate: true });
  }, [markArea, getEchartsInstance, buildMarkAreaConfig]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center" style={{ height: height - 20 }}>
          <Spin size="large" />
        </div>
      );
    }

    if (!isValidData) {
      return (
        <div className="flex items-center justify-center" style={{ height: height - 20 }}>
          <Empty
            description="暂无数据"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      );
    }

    const option = getOption();
    prevOptionRef.current = option;

    return (
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={false}
        lazyUpdate={true}
      />
    );
  };

  return (
    <Card
      className="bg-zinc-900 border-zinc-800"
      styles={{ body: { padding: 0 } }}
      title={
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="font-medium">{title}</span>
            <Tooltip title="数据点总数">
              <Badge
                count={`${totalDataPoints.toLocaleString()} 点`}
                style={{ backgroundColor: isLargeDataset ? '#faad14' : '#52c41a' }}
              />
            </Tooltip>
            {isLargeDataset && (
              <Tooltip title="已启用大数据优化模式">
                <Badge count="大数据模式" style={{ backgroundColor: '#1677ff' }} />
              </Tooltip>
            )}
          </div>
          <Select
            size="small"
            value={sampling}
            onChange={setSampling}
            className="w-32"
            options={[
              { value: 'none', label: '原始数据' },
              { value: 'average', label: '均值采样' },
              { value: 'lttb', label: 'LTTB采样' },
            ]}
          />
        </div>
      }
    >
      {renderContent()}
    </Card>
  );
}

export type { TimeSeriesChartProps };
