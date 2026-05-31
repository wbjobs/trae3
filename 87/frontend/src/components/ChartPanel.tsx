import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { PARAMETER_CONFIG, ParameterKey, SensorData } from '../types';

interface ChartPanelProps {
  deviceId: string;
  parameter: ParameterKey;
  data: SensorData[];
  maxPoints?: number;
}

const PARAM_Y_RANGE: Record<string, [number, number]> = {
  temperature: [20, 100],
  vibration: [0, 12],
  pressure: [-0.5, 8],
  rpm: [800, 4500],
  current: [0, 40],
};

const ChartPanel: React.FC<ChartPanelProps> = ({ deviceId, parameter, data, maxPoints = 120 }) => {
  const chartRef = useRef<ReactECharts>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const dataRef = useRef<{ ts: number; value: number }[]>([]);
  const lastUpdateRef = useRef<number>(0);
  const throttleMs = 800;
  const config = PARAMETER_CONFIG[parameter];
  const yRange = PARAM_Y_RANGE[parameter] || [0, 100];

  const sortedData = useMemo(() => {
    const filtered = data.filter((d) => d.device_id === deviceId && d[parameter] != null);
    const mapped: { ts: number; value: number }[] = filtered.map((d) => ({
      ts: Date.parse(d.timestamp),
      value: d[parameter] as number,
    }));
    mapped.sort((a, b) => a.ts - b.ts);
    return mapped.slice(-maxPoints);
  }, [data, deviceId, parameter, maxPoints]);

  useEffect(() => {
    dataRef.current = sortedData;
  }, [sortedData]);

  useEffect(() => {
    if (chartRef.current) {
      instanceRef.current = chartRef.current.getEchartsInstance();
    }
  }, []);

  const updateChart = useCallback(() => {
    const chart = instanceRef.current;
    if (!chart) return;

    const now = Date.now();
    if (now - lastUpdateRef.current < throttleMs) return;
    lastUpdateRef.current = now;

    const values = dataRef.current;
    if (values.length === 0) return;

    const times = values.map((d) => {
      const t = new Date(d.ts);
      return `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`;
    });
    const vals = values.map((d) => d.value);

    chart.setOption(
      {
        xAxis: {
          data: times,
          axisLabel: { interval: Math.max(0, Math.floor(times.length / 6)) },
        },
        series: [
          {
            data: vals,
          },
        ],
      },
      { notMerge: false, lazyUpdate: true, silent: true }
    );
  }, []);

  useEffect(() => {
    const rafId = requestAnimationFrame(updateChart);
    return () => cancelAnimationFrame(rafId);
  }, [sortedData.length, updateChart]);

  const baseOption = useMemo(() => {
    return {
      title: {
        text: `${config.label} (${config.unit})`,
        left: 10,
        top: 5,
        textStyle: { fontSize: 13, fontWeight: 500, color: '#333' },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', snap: true },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          if (!p) return '';
          return `${p.axisValue}<br/>${config.label}: <b>${Number(p.value).toFixed(2)}</b> ${config.unit}`;
        },
      },
      grid: { left: 50, right: 20, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: [],
        boundaryGap: false,
        axisLabel: { fontSize: 10, rotate: 0, interval: 0 },
        axisLine: { lineStyle: { color: '#ddd' } },
      },
      yAxis: {
        type: 'value',
        min: yRange[0],
        max: yRange[1],
        axisLabel: { fontSize: 10 },
        splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
      },
      series: [
        {
          type: 'line',
          data: [],
          smooth: true,
          symbol: 'none',
          sampling: 'lttb',
          showSymbol: false,
          clip: true,
          lineStyle: { width: 2, color: config.color },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: config.color + '3d' },
                { offset: 1, color: config.color + '05' },
              ],
            },
          },
        },
      ],
      animation: false,
      hoverLayerThreshold: 500,
    };
  }, [parameter, config, yRange]);

  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <ReactECharts
        ref={chartRef}
        option={baseOption}
        notMerge={true}
        lazyUpdate={true}
        style={{ height: 220 }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
};

export default React.memo(ChartPanel);
