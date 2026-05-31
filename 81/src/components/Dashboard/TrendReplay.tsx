import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as echarts from 'echarts';
import { Play, Pause, RotateCcw, FastForward, Settings, Calendar, MapPin, Activity, AlertTriangle } from 'lucide-react';
import { dataApi } from '../../services/api';
import type { TrendReplayResponse, AreaInfo, AnomalyType } from '../../types';
import { ANOMALY_TYPE_CONFIG } from '../../types';
import { ChartSkeleton } from '../Common/Skeleton';
import { ErrorBoundary } from '../Common/ErrorBoundary';

interface TrendReplayProps {
  areas: AreaInfo[];
}

type Granularity = '1h' | '6h' | '12h' | '1d' | '1w';

const TIME_RANGES = [
  { label: '最近24小时', value: 24 * 3600000, granularity: '1h' as Granularity },
  { label: '最近7天', value: 7 * 86400000, granularity: '6h' as Granularity },
  { label: '最近30天', value: 30 * 86400000, granularity: '1d' as Granularity },
  { label: '最近90天', value: 90 * 86400000, granularity: '1d' as Granularity },
  { label: '最近1年', value: 365 * 86400000, granularity: '1w' as Granularity }
];

const PLAYBACK_SPEEDS = [
  { label: '0.5x', value: 2000 },
  { label: '1x', value: 1000 },
  { label: '2x', value: 500 },
  { label: '4x', value: 250 }
];

export const TrendReplay: React.FC<TrendReplayProps> = ({ areas }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [loading, setLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [timeRangeIndex, setTimeRangeIndex] = useState(1);
  const [granularity, setGranularity] = useState<Granularity>('6h');
  const [trendData, setTrendData] = useState<TrendReplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [showSettings, setShowSettings] = useState(false);

  const timeRange = TIME_RANGES[timeRangeIndex];

  const loadTrendData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCurrentIndex(0);
    try {
      const endTime = Date.now();
      const startTime = endTime - timeRange.value;

      const response = await dataApi.getTrendReplay({
        startTime,
        endTime,
        granularity,
        areaId: selectedArea || undefined
      });

      setTrendData(response.data);
    } catch (err) {
      setError('加载趋势数据失败');
      console.error('Failed to load trend replay:', err);
    } finally {
      setLoading(false);
    }
  }, [timeRange, granularity, selectedArea]);

  useEffect(() => {
    setGranularity(timeRange.granularity);
  }, [timeRange]);

  useEffect(() => {
    loadTrendData();
  }, [loadTrendData]);

  const stopPlayback = useCallback(() => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    if (!trendData || currentIndex >= trendData.dataPoints.length - 1) {
      setCurrentIndex(0);
    }

    setIsPlaying(true);
    playbackTimerRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        if (!trendData) return prev;
        if (prev >= trendData.dataPoints.length - 1) {
          stopPlayback();
          return prev;
        }
        return prev + 1;
      });
    }, PLAYBACK_SPEEDS[speedIndex].value);
  }, [trendData, currentIndex, speedIndex, stopPlayback]);

  const togglePlayback = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };

  const resetPlayback = () => {
    stopPlayback();
    setCurrentIndex(0);
  };

  const handleTimeRangeChange = (index: number) => {
    stopPlayback();
    setTimeRangeIndex(index);
  };

  const handleGranularityChange = (g: Granularity) => {
    stopPlayback();
    setGranularity(g);
  };

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  useEffect(() => {
    if (!chartRef.current || loading || !trendData) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const visibleData = trendData.dataPoints.slice(0, currentIndex + 1);
    const xAxisData = visibleData.map(d => {
      const date = new Date(d.timestamp);
      if (granularity === '1h' || granularity === '6h' || granularity === '12h') {
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`;
      } else if (granularity === '1d') {
        return `${date.getMonth() + 1}/${date.getDate()}`;
      } else {
        return `${date.getMonth() + 1}月第${Math.ceil(date.getDate() / 7)}周`;
      }
    });

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: { color: '#374151' },
        formatter: (params: any) => {
          const data = params[0];
          const point = visibleData[data.dataIndex];
          if (!point) return '';
          
          let html = `<div style="font-weight: 600; margin-bottom: 8px;">${data.name}</div>`;
          html += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #06b6d4;"></span>
                    <span>用水量: <strong>${point.consumption.toFixed(2)}</strong> m³</span>
                  </div>`;
          html += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #6366f1;"></span>
                    <span>平均流量: <strong>${point.avgFlowRate.toFixed(2)}</strong> m³/h</span>
                  </div>`;
          html += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #10b981;"></span>
                    <span>设备数: <strong>${point.deviceCount}</strong> 台</span>
                  </div>`;
          if (point.anomalyCount > 0) {
            html += `<div style="display: flex; align-items: center; gap: 8px; color: #ef4444;">
                      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #ef4444;"></span>
                      <span>异常数: <strong>${point.anomalyCount}</strong> 个</span>
                    </div>`;
          }
          return html;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        top: '8%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { 
          color: '#6b7280',
          fontSize: 10,
          rotate: 30
        }
      },
      yAxis: [
        {
          type: 'value',
          name: '用水量 (m³)',
          position: 'left',
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } },
          axisLabel: { color: '#6b7280', fontSize: 11 }
        },
        {
          type: 'value',
          name: '设备数',
          position: 'right',
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: '#6b7280', fontSize: 11 }
        }
      ],
      series: [
        {
          name: '用水量',
          type: 'line',
          smooth: true,
          data: visibleData.map(d => d.consumption),
          itemStyle: { color: '#06b6d4' },
          lineStyle: { width: 3 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(6, 182, 212, 0.3)' },
              { offset: 1, color: 'rgba(6, 182, 212, 0.05)' }
            ])
          },
          symbol: 'circle',
          symbolSize: 8,
          emphasis: {
            itemStyle: {
              color: '#06b6d4',
              borderColor: '#fff',
              borderWidth: 3
            }
          }
        },
        {
          name: '设备数',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          data: visibleData.map(d => d.deviceCount),
          itemStyle: { color: '#10b981' },
          lineStyle: { width: 2, type: 'dashed' },
          symbol: 'diamond',
          symbolSize: 6
        },
        {
          name: '异常点',
          type: 'scatter',
          data: visibleData
            .map((d, i) => d.anomalyCount > 0 ? { value: [i, d.consumption], anomalyCount: d.anomalyCount } : null)
            .filter(Boolean),
          itemStyle: {
            color: '#ef4444',
            shadowBlur: 10,
            shadowColor: 'rgba(239, 68, 68, 0.5)'
          },
          symbolSize: (data: any) => 10 + data.anomalyCount * 3,
          emphasis: {
            itemStyle: {
              color: '#dc2626',
              borderColor: '#fff',
              borderWidth: 3
            }
          }
        }
      ],
      visualMap: {
        show: false,
        pieces: [
          {
            gt: 0,
            label: '异常',
            color: '#ef4444'
          }
        ]
      }
    };

    chartInstanceRef.current.setOption(option, true);

    const handleResize = () => chartInstanceRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [trendData, currentIndex, loading, granularity]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  const currentPoint = trendData?.dataPoints[currentIndex];
  const progress = trendData
    ? ((currentIndex + 1) / trendData.dataPoints.length) * 100
    : 0;

  return (
    <ErrorBoundary>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">历史数据趋势回放</h3>
            <p className="text-sm text-gray-500">动态回放历史用水趋势，自动标记异常时段</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedArea}
              onChange={(e) => { stopPlayback(); setSelectedArea(e.target.value); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">全部区域</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </select>

            <div className="flex bg-gray-100 rounded-lg p-1">
              {TIME_RANGES.map((range, index) => (
                <button
                  key={range.label}
                  onClick={() => handleTimeRangeChange(index)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    timeRangeIndex === index
                      ? 'bg-white text-cyan-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg transition-all ${
                showSettings ? 'bg-cyan-100 text-cyan-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">聚合粒度:</span>
              <div className="flex gap-1">
                {(['1h', '6h', '12h', '1d', '1w'] as Granularity[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => handleGranularityChange(g)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                      granularity === g
                        ? 'bg-cyan-500 text-white'
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-cyan-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">回放速度:</span>
              <div className="flex gap-1">
                {PLAYBACK_SPEEDS.map((speed, index) => (
                  <button
                    key={speed.label}
                    onClick={() => {
                      setSpeedIndex(index);
                      if (isPlaying) {
                        stopPlayback();
                        setTimeout(startPlayback, 100);
                      }
                    }}
                    className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                      speedIndex === index
                        ? 'bg-cyan-500 text-white'
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-cyan-300'
                    }`}
                  >
                    {speed.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="flex items-center justify-center h-80 text-red-500">{error}</div>
        ) : (
          <>
            <div ref={chartRef} className="w-full h-80" />

            {trendData && (
              <>
                <div className="mt-4 flex flex-wrap gap-3">
                  <div className="flex items-center gap-2 px-3 py-2 bg-cyan-50 rounded-lg">
                    <span className="text-sm text-cyan-600">总用水量:</span>
                    <span className="font-semibold text-gray-800">{trendData.totalConsumption.toFixed(1)} m³</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg">
                    <span className="text-sm text-orange-600">峰值用量:</span>
                    <span className="font-semibold text-gray-800">{trendData.maxConsumption.toFixed(1)} m³</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                    <span className="text-sm text-green-600">平均用量:</span>
                    <span className="font-semibold text-gray-800">{trendData.avgConsumption.toFixed(1)} m³</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg">
                    <span className="text-sm text-red-600">异常时段:</span>
                    <span className="font-semibold text-gray-800">{trendData.anomalies.length} 个</span>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={togglePlayback}
                      disabled={!trendData.dataPoints.length}
                      className="flex items-center justify-center w-12 h-12 rounded-full bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>

                    <button
                      onClick={resetPlayback}
                      disabled={!trendData.dataPoints.length}
                      className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setCurrentIndex(trendData.dataPoints.length - 1)}
                      disabled={!trendData.dataPoints.length}
                      className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                      <FastForward className="w-4 h-4" />
                    </button>

                    <div className="flex-1">
                      <input
                        type="range"
                        min="0"
                        max={trendData.dataPoints.length - 1}
                        value={currentIndex}
                        onChange={(e) => {
                          stopPlayback();
                          setCurrentIndex(parseInt(e.target.value));
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>

                    <span className="text-sm text-gray-500 min-w-[120px] text-right">
                      {currentIndex + 1} / {trendData.dataPoints.length}
                    </span>
                  </div>

                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {currentPoint && (
                    <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">
                          {new Date(currentPoint.timestamp).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{currentPoint.deviceCount} 台设备</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-cyan-500" />
                        <span className="text-cyan-700 font-medium">{currentPoint.consumption.toFixed(2)} m³</span>
                      </div>
                      {currentPoint.anomalyCount > 0 && (
                        <div className="flex items-center gap-2 text-red-600">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="font-medium">{currentPoint.anomalyCount} 个异常</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {trendData.anomalies.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-500" />
                      异常事件记录
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {trendData.anomalies.slice(0, 10).map((anomaly, index) => {
                        const config = ANOMALY_TYPE_CONFIG[anomaly.type as AnomalyType] || ANOMALY_TYPE_CONFIG.flow_abnormal;
                        return (
                          <div
                            key={index}
                            className="flex items-center gap-3 p-2 bg-red-50 rounded-lg border border-red-100"
                          >
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: config.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-800 text-sm">{config.label}</span>
                                <span
                                  className="px-1.5 py-0.5 text-xs rounded"
                                  style={{ backgroundColor: `${config.color}15`, color: config.color }}
                                >
                                  {anomaly.level === 'critical' ? '严重' : anomaly.level === 'error' ? '错误' : '警告'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 truncate">{anomaly.message}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-xs text-gray-500">
                                {new Date(anomaly.timestamp).toLocaleString('zh-CN')}
                              </div>
                              <div className="text-xs text-gray-400">{anomaly.deviceCount} 台设备</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
};
