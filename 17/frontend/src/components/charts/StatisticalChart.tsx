import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Card, Spin, Tabs, Empty } from 'antd';
import { CHART_COLORS } from '@/constants';
import { isEmpty } from '@/utils';

interface ChartDataItem {
  name: string;
  value: number;
  color?: string;
  percentage?: number;
}

interface StatisticalChartProps {
  title?: string;
  pieData?: ChartDataItem[];
  barData?: ChartDataItem[];
  byType?: ChartDataItem[];
  bySeverity?: ChartDataItem[];
  loading?: boolean;
  height?: number;
  showLegend?: boolean;
}

const typeLabels: Record<string, string> = {
  voltage_abnormal: '电压异常',
  current_abnormal: '电流异常',
  temperature_high: '温度过高',
  offline: '离线',
  short_circuit: '短路',
};

const severityLabels: Record<string, string> = {
  low: '低危',
  medium: '中危',
  high: '高危',
  critical: '严重',
};

function safeChartData(data?: ChartDataItem[]): ChartDataItem[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter(item =>
      item &&
      typeof item === 'object' &&
      typeof item.name === 'string' &&
      typeof item.value === 'number' &&
      !isNaN(item.value) &&
      isFinite(item.value)
    )
    .map(item => ({
      ...item,
      value: Math.max(0, item.value),
    }));
}

function getPieOption(
  data: ChartDataItem[],
  labelMap?: Record<string, string>,
  showLegend: boolean = true
): EChartsOption {
  const safeData = safeChartData(data);

  const chartData = safeData.map((item, index) => ({
    name: labelMap ? (labelMap[item.name] || item.name) : item.name,
    value: item.value,
    itemStyle: {
      color: item.color || CHART_COLORS[index % CHART_COLORS.length],
    },
  }));

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(31, 31, 31, 0.95)',
      borderColor: '#3f3f46',
      textStyle: {
        color: '#e5e7eb',
      },
      formatter: (params: any) => {
        if (!params || typeof params.value !== 'number') return '';
        const percent = params.percent ? `${params.percent.toFixed(1)}%` : '';
        return `${params.name}: ${params.value} ${percent ? `(${percent})` : ''}`;
      },
    },
    legend: showLegend ? {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: {
        color: '#a1a1aa',
      },
    } : undefined,
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#1f1f1f',
          borderWidth: 2,
        },
        label: {
          show: false,
          position: 'center',
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold',
            color: '#e5e7eb',
          },
        },
        labelLine: {
          show: false,
        },
        data: chartData,
      },
    ],
  };
}

function getBarOption(
  data: ChartDataItem[],
  labelMap?: Record<string, string>
): EChartsOption {
  const safeData = safeChartData(data);

  const categories = safeData.map(item =>
    labelMap ? (labelMap[item.name] || item.name) : item.name
  );

  const values = safeData.map((item, index) => ({
    value: item.value,
    itemStyle: {
      color: item.color || CHART_COLORS[index % CHART_COLORS.length],
      borderRadius: [4, 4, 0, 0],
    },
  }));

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
        type: 'shadow',
      },
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        const item = params[0];
        return `${item.name}: ${item.value}`;
      },
    },
    grid: {
      left: 60,
      right: 30,
      top: 30,
      bottom: 40,
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: {
        lineStyle: { color: '#3f3f46' },
      },
      axisLabel: {
        color: '#71717a',
        fontSize: 11,
        rotate: categories.length > 6 ? 30 : 0,
        interval: 0,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: {
        color: '#71717a',
        fontSize: 11,
      },
      splitLine: {
        lineStyle: {
          color: '#27272a',
          type: 'dashed',
        },
      },
      minInterval: 1,
    },
    series: [
      {
        type: 'bar',
        data: values,
        barWidth: Math.min(60, 300 / Math.max(categories.length, 1)),
        large: values.length > 100,
        largeThreshold: 100,
      },
    ],
  };
}

export default function StatisticalChart({
  title,
  pieData,
  barData,
  byType,
  bySeverity,
  loading = false,
  height = 320,
  showLegend = true,
}: StatisticalChartProps) {
  const hasData = useMemo(() => {
    return (
      !isEmpty(safeChartData(pieData)) ||
      !isEmpty(safeChartData(barData)) ||
      !isEmpty(safeChartData(byType)) ||
      !isEmpty(safeChartData(bySeverity))
    );
  }, [pieData, barData, byType, bySeverity]);

  const renderChart = (option: EChartsOption, chartHeight: number = height) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center" style={{ height: chartHeight }}>
          <Spin size="large" />
        </div>
      );
    }

    if (!hasData) {
      return (
        <div className="flex items-center justify-center" style={{ height: chartHeight }}>
          <Empty
            description="暂无数据"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      );
    }

    return (
      <ReactECharts
        option={option}
        style={{ height: chartHeight, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={false}
        lazyUpdate={true}
      />
    );
  };

  if (pieData && barData) {
    const tabItems = [
      {
        key: 'pie',
        label: '饼图',
        children: renderChart(getPieOption(pieData, undefined, showLegend), height - 20),
      },
      {
        key: 'bar',
        label: '柱状图',
        children: renderChart(getBarOption(barData), height - 20),
      },
    ];

    return (
      <Card
        className="bg-zinc-900 border-zinc-800"
        styles={{ body: { padding: 0 } }}
        title={title}
      >
        <Tabs items={tabItems} className="px-4" />
      </Card>
    );
  }

  if (pieData) {
    return (
      <Card
        className="bg-zinc-900 border-zinc-800"
        styles={{ body: { padding: 0 } }}
        title={title}
      >
        {renderChart(getPieOption(pieData, undefined, showLegend))}
      </Card>
    );
  }

  if (barData) {
    return (
      <Card
        className="bg-zinc-900 border-zinc-800"
        styles={{ body: { padding: 0 } }}
        title={title}
      >
        {renderChart(getBarOption(barData))}
      </Card>
    );
  }

  const tabItems = [
    {
      key: 'type',
      label: '按故障类型',
      children: (
        <div className="flex">
          <div style={{ width: '50%' }}>
            {renderChart(getPieOption(byType || [], typeLabels), height - 20)}
          </div>
          <div style={{ width: '50%' }}>
            {renderChart(getBarOption(byType || [], typeLabels), height - 20)}
          </div>
        </div>
      ),
    },
    {
      key: 'severity',
      label: '按严重程度',
      children: (
        <div className="flex">
          <div style={{ width: '50%' }}>
            {renderChart(getPieOption(bySeverity || [], severityLabels), height - 20)}
          </div>
          <div style={{ width: '50%' }}>
            {renderChart(getBarOption(bySeverity || [], severityLabels), height - 20)}
          </div>
        </div>
      ),
    },
  ];

  return (
    <Card
      className="bg-zinc-900 border-zinc-800"
      styles={{ body: { padding: 0 } }}
      title={title}
    >
      <Tabs items={tabItems} className="px-4" />
    </Card>
  );
}
