import { useEffect, useState, useCallback } from 'react';
import { Gauge, AlertTriangle, TrendingDown, TrendingUp, RefreshCw, Activity, Droplets, Thermometer } from 'lucide-react';
import { api } from '@/services/api';
import VirtualScroll from '@/components/VirtualScroll';
import { useMonitorStore } from '@/store/useMonitorStore';
import type { PipelineData, AlertEvent, PressureAnalysisResult } from '@/types';
import { formatTime } from '@/utils/time';
import { getStatusColor } from '@/utils/format';

const statusColors = {
  normal: 'bg-status-success/20 text-status-success border-status-success/50',
  warning: 'bg-status-warning/20 text-status-warning border-status-warning/50',
  critical: 'bg-status-error/20 text-status-error border-status-error/50',
};

export default function PressureMonitor() {
  const { setWsConnected } = useMonitorStore();
  const [pipelines, setPipelines] = useState<PipelineData[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<PressureAnalysisResult | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pipelinesData, alertsData] = await Promise.all([
        api.getPipelines(),
        api.getPressureAlerts(),
      ]);
      setPipelines(pipelinesData);
      setAlerts(alertsData);
    } catch (error) {
      console.error('Failed to load pressure data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const analyzePressure = async (pipelineId: string) => {
    try {
      const pipeline = pipelines.find(p => p.id === pipelineId);
      if (pipeline) {
        const result = await api.analyzePressure({
          pipeline: pipelineId,
          pressure: pipeline.pressure,
          flow_rate: pipeline.flow_rate,
        });
        setSelectedPipeline(pipelineId);
        setAnalysisResult(result);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-status-error" />;
      case 'warning':
        return <TrendingDown className="w-4 h-4 text-status-warning" />;
      default:
        return <Activity className="w-4 h-4 text-status-success" />;
    }
  };

  const renderPipelineRow = (pipeline: PipelineData, index: number) => (
    <div
      className={`flex items-center justify-between p-3 border-b border-border-glow/30 hover:bg-bg-tertiary/50 cursor-pointer transition-colors ${
        selectedPipeline === pipeline.id ? 'bg-accent-cyan/10' : ''
      }`}
      onClick={() => analyzePressure(pipeline.id)}
    >
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-lg ${statusColors[pipeline.status as keyof typeof statusColors]}`}>
          {getStatusIcon(pipeline.status)}
        </div>
        <div>
          <div className="font-medium">{pipeline.name}</div>
          <div className="text-xs text-gray-500">{pipeline.region} · {formatTime(pipeline.last_update)}</div>
        </div>
      </div>
      <div className="flex items-center gap-6 text-sm">
        <div className="text-right">
          <div className="font-mono font-medium">{pipeline.pressure.toFixed(3)} MPa</div>
          <div className="text-xs text-gray-500">压力</div>
        </div>
        <div className="text-right">
          <div className="font-mono">{pipeline.flow_rate.toFixed(1)} m³/h</div>
          <div className="text-xs text-gray-500">流量</div>
        </div>
        <div>
          <span className={`px-2 py-0.5 rounded text-xs border ${statusColors[pipeline.status as keyof typeof statusColors]}`}>
            {pipeline.status === 'normal' ? '正常' : pipeline.status === 'warning' ? '警告' : '严重'}
          </span>
        </div>
      </div>
    </div>
  );

  const statusCounts = {
    normal: pipelines.filter(p => p.status === 'normal').length,
    warning: pipelines.filter(p => p.status === 'warning').length,
    critical: pipelines.filter(p => p.status === 'critical').length,
  };

  const avgPressure = pipelines.length > 0
    ? pipelines.reduce((sum, p) => sum + p.pressure, 0) / pipelines.length
    : 0;
  const avgFlow = pipelines.length > 0
    ? pipelines.reduce((sum, p) => sum + p.flow_rate, 0) / pipelines.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">管网压力监测</h1>
          <p className="text-gray-400">实时压力监控与异常预警分析</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/50 hover:bg-accent-cyan/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-accent-cyan" />
            <span className="text-sm text-gray-400">平均压力</span>
          </div>
          <div className="text-2xl font-bold font-mono">{avgPressure.toFixed(3)} <span className="text-sm text-gray-500">MPa</span></div>
        </div>

        <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
          <div className="flex items-center gap-2 mb-2">
            <Droplets className="w-4 h-4 text-accent-blue" />
            <span className="text-sm text-gray-400">平均流量</span>
          </div>
          <div className="text-2xl font-bold font-mono">{avgFlow.toFixed(1)} <span className="text-sm text-gray-500">m³/h</span></div>
        </div>

        <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-status-success" />
            <span className="text-sm text-gray-400">正常管线</span>
          </div>
          <div className="text-2xl font-bold text-status-success">{statusCounts.normal}</div>
        </div>

        <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-status-error" />
            <span className="text-sm text-gray-400">异常管线</span>
          </div>
          <div className="text-2xl font-bold">
            <span className="text-status-warning">{statusCounts.warning}</span>
            <span className="text-gray-500 mx-1">/</span>
            <span className="text-status-error">{statusCounts.critical}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" />
              管线状态列表
            </h2>
            <span className="text-xs text-gray-500">共 {pipelines.length} 条管线</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <VirtualScroll
              items={pipelines}
              itemHeight={64}
              containerHeight={400}
              renderItem={renderPipelineRow}
            />
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
            <h2 className="font-medium mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-status-warning" />
              压力分析结果
            </h2>

            {analysisResult ? (
              <div className="space-y-4">
                <div className={`p-3 rounded-lg border ${statusColors[analysisResult.level as keyof typeof statusColors]}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {analysisResult.is_anomaly ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <Activity className="w-4 h-4" />
                    )}
                    <span className="font-medium">
                      {analysisResult.is_anomaly ? '检测到异常' : '运行正常'}
                    </span>
                  </div>
                  <p className="text-sm opacity-80">{analysisResult.recommended_action}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-500">异常类型</div>
                    <div className="font-mono">{analysisResult.type}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">压降速率</div>
                    <div className={`font-mono ${analysisResult.drop_rate < 0 ? 'text-status-error' : 'text-status-success'}`}>
                      {analysisResult.drop_rate.toFixed(4)}/min
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">置信度</div>
                    <div className="font-mono">{(analysisResult.confidence * 100).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-gray-500">影响区域</div>
                    <div>{analysisResult.affected_region}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Gauge className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>选择管线查看详细分析</p>
              </div>
            )}
          </div>

          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
            <h2 className="font-medium mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-status-error" />
              活跃告警 ({alerts.length})
            </h2>

            {alerts.length > 0 ? (
              <div className="space-y-2 max-h-[200px] overflow-auto">
                {alerts.slice(0, 5).map(alert => (
                  <div
                    key={alert.id}
                    className={`p-2 rounded-lg border text-sm ${statusColors[alert.level as keyof typeof statusColors]}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{alert.source}</span>
                      <span className="text-xs opacity-70">{formatTime(alert.timestamp)}</span>
                    </div>
                    <p className="text-xs opacity-80">{alert.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500 text-sm">
                暂无压力告警
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
