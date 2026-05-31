import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { DashboardOverview } from '../../types';

interface ConsumptionChartProps {
  data: { hour: number; consumption: number }[];
}

export const ConsumptionChart: React.FC<ConsumptionChartProps> = ({ data }) => {
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: {
        color: '#374151'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map((d) => `${d.hour}:00`),
      axisLine: {
        lineStyle: {
          color: '#e5e7eb'
        }
      },
      axisLabel: {
        color: '#6b7280',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      name: 'm³',
      nameTextStyle: {
        color: '#6b7280',
        fontSize: 12
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#6b7280',
        fontSize: 12
      },
      splitLine: {
        lineStyle: {
          color: '#f3f4f6',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '用水量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.map((d) => d.consumption),
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(22, 93, 255, 0.3)' },
              { offset: 1, color: 'rgba(22, 93, 255, 0.05)' }
            ]
          }
        },
        lineStyle: {
          color: '#165DFF',
          width: 3
        },
        itemStyle: {
          color: '#165DFF',
          borderColor: '#fff',
          borderWidth: 2
        }
      }
    ]
  };

  return <ReactECharts option={option} style={{ height: '300px', width: '100%' }} />;
};

interface StatusDistributionChartProps {
  distribution: DashboardOverview['deviceStatusDistribution'];
}

export const StatusDistributionChart: React.FC<StatusDistributionChartProps> = ({
  distribution
}) => {
  const data = [
    { value: distribution.normal, name: '正常', itemStyle: { color: '#00B42A' } },
    { value: distribution.warning, name: '告警', itemStyle: { color: '#FF7D00' } },
    { value: distribution.error, name: '故障', itemStyle: { color: '#F53F3F' } },
    { value: distribution.offline, name: '离线', itemStyle: { color: '#86909C' } }
  ].filter((d) => d.value > 0);

  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: {
        color: '#374151'
      }
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: {
        color: '#4E5969',
        fontSize: 13
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: false
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold'
          }
        },
        labelLine: {
          show: false
        },
        data
      }
    ]
  };

  return <ReactECharts option={option} style={{ height: '300px', width: '100%' }} />;
};
