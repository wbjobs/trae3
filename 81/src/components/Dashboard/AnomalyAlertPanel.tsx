import React, { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Droplets, MinusCircle, ArrowLeftCircle, Activity, Bell, CheckCircle, Clock, XCircle } from 'lucide-react';
import { alertApi, dataApi } from '../../services/api';
import type { AlertInfo, AnomalyType, AreaInfo, DataFilter } from '../../types';
import { ANOMALY_TYPE_CONFIG } from '../../types';
import { AlertListSkeleton } from '../Common/Skeleton';
import { ErrorBoundary } from '../Common/ErrorBoundary';

interface AnomalyAlertPanelProps {
  areas: AreaInfo[];
  onAlertHandled?: () => void;
}

const WATER_ANOMALY_TYPES: AnomalyType[] = [
  'flow_spike',
  'flow_drop',
  'leak_detected',
  'no_flow',
  'abnormal_consumption',
  'reverse_flow'
];

const ANOMALY_ICONS: Record<AnomalyType, React.ReactNode> = {
  flow_spike: <TrendingUp className="w-4 h-4" />,
  flow_drop: <TrendingDown className="w-4 h-4" />,
  leak_detected: <Droplets className="w-4 h-4" />,
  no_flow: <MinusCircle className="w-4 h-4" />,
  abnormal_consumption: <Activity className="w-4 h-4" />,
  reverse_flow: <ArrowLeftCircle className="w-4 h-4" />,
  battery_low: <Activity className="w-4 h-4" />,
  signal_weak: <Activity className="w-4 h-4" />,
  device_error: <Activity className="w-4 h-4" />,
  flow_abnormal: <Activity className="w-4 h-4" />
};

const STATUS_CONFIG = {
  pending: { label: '待处理', color: 'bg-orange-100 text-orange-700', icon: <Clock className="w-3 h-3" /> },
  processing: { label: '处理中', color: 'bg-blue-100 text-blue-700', icon: <Activity className="w-3 h-3" /> },
  resolved: { label: '已解决', color: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" /> }
};

const LEVEL_COLORS = {
  info: 'border-l-blue-500',
  warning: 'border-l-yellow-500',
  error: 'border-l-red-500',
  critical: 'border-l-red-700'
};

export const AnomalyAlertPanel: React.FC<AnomalyAlertPanelProps> = ({ areas, onAlertHandled }) => {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);
  const [selectedType, setSelectedType] = useState<AnomalyType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedArea, setSelectedArea] = useState<string>('all');
  const [stats, setStats] = useState<Record<AnomalyType, number>>({} as Record<AnomalyType, number>);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const filter: DataFilter = {
        pageSize: 50,
        page: 1
      };

      if (selectedType !== 'all') {
        filter.keyword = selectedType;
      }
      if (selectedStatus !== 'all') {
        filter.status = selectedStatus;
      }
      if (selectedArea !== 'all') {
        filter.areaId = selectedArea;
      }

      const response = await alertApi.getAlerts(filter);
      const allAlerts = response.data.list;
      
      const waterAlerts = allAlerts.filter(alert =>
        WATER_ANOMALY_TYPES.includes(alert.type as AnomalyType)
      );

      setAlerts(waterAlerts);

      const typeStats: Record<AnomalyType, number> = {} as Record<AnomalyType, number>;
      WATER_ANOMALY_TYPES.forEach(type => {
        typeStats[type] = allAlerts.filter(a => a.type === type).length;
      });
      setStats(typeStats);
    } catch (error) {
      console.error('Failed to load anomaly alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [selectedType, selectedStatus, selectedArea]);

  const handleAlert = async (alertId: string, newStatus: string) => {
    try {
      await alertApi.handleAlert(alertId, newStatus);
      loadAlerts();
      onAlertHandled?.();
    } catch (error) {
      console.error('Failed to handle alert:', error);
    }
  };

  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      if (selectedType !== 'all' && alert.type !== selectedType) return false;
      if (selectedStatus !== 'all' && alert.status !== selectedStatus) return false;
      return true;
    });
  }, [alerts, selectedType, selectedStatus]);

  const pendingCount = alerts.filter(a => a.status === 'pending').length;
  const criticalCount = alerts.filter(a => a.level === 'critical' || a.level === 'error').length;

  return (
    <ErrorBoundary>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <Bell className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">用水异常告警</h3>
              <p className="text-sm text-gray-500">实时检测并展示用水相关异常事件</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <div className="flex items-center gap-1 px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-sm">
                <AlertTriangle className="w-4 h-4" />
                {pendingCount} 个待处理
              </div>
            )}
            {criticalCount > 0 && (
              <div className="flex items-center gap-1 px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm">
                <XCircle className="w-4 h-4" />
                {criticalCount} 个严重
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <button
            onClick={() => setSelectedType('all')}
            className={`p-3 rounded-lg border-2 transition-all text-center ${
              selectedType === 'all'
                ? 'border-cyan-500 bg-cyan-50'
                : 'border-gray-100 hover:border-gray-200 bg-gray-50'
            }`}
          >
            <div className="text-xl font-bold text-gray-800">
              {Object.values(stats).reduce((a, b) => a + b, 0)}
            </div>
            <div className="text-xs text-gray-500 mt-1">全部异常</div>
          </button>
          {WATER_ANOMALY_TYPES.map(type => {
            const config = ANOMALY_TYPE_CONFIG[type];
            const count = stats[type] || 0;
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`p-3 rounded-lg border-2 transition-all text-center ${
                  selectedType === type
                    ? 'border-cyan-500 bg-cyan-50'
                    : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                }`}
              >
                <div className="text-xl font-bold" style={{ color: config.color }}>
                  {count}
                </div>
                <div className="text-xs text-gray-500 mt-1">{config.label}</div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">全部区域</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">全部状态</option>
            <option value="pending">待处理</option>
            <option value="processing">处理中</option>
            <option value="resolved">已解决</option>
          </select>

          <button
            onClick={loadAlerts}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            刷新
          </button>
        </div>

        {loading ? (
          <AlertListSkeleton />
        ) : filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <CheckCircle className="w-12 h-12 mb-3 text-green-400" />
            <p className="text-lg font-medium">暂无异常告警</p>
            <p className="text-sm">所有设备运行正常</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredAlerts.map((alert) => {
              const typeConfig = ANOMALY_TYPE_CONFIG[alert.type as AnomalyType] || ANOMALY_TYPE_CONFIG.flow_abnormal;
              const statusConfig = STATUS_CONFIG[alert.status as keyof typeof STATUS_CONFIG];
              const levelClass = LEVEL_COLORS[alert.level as keyof typeof LEVEL_COLORS] || LEVEL_COLORS.warning;

              return (
                <div
                  key={alert.id}
                  className={`flex items-start gap-4 p-4 rounded-lg border-l-4 bg-gray-50 hover:bg-gray-100 transition-colors ${levelClass}`}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${typeConfig.color}15`, color: typeConfig.color }}
                  >
                    {ANOMALY_ICONS[alert.type as AnomalyType] || <AlertTriangle className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-gray-800">{typeConfig.label}</h4>
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${statusConfig.color}`}>
                            {statusConfig.icon}
                            {statusConfig.label}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded text-xs"
                            style={{ backgroundColor: `${typeConfig.color}15`, color: typeConfig.color }}
                          >
                            {alert.level === 'critical' ? '严重' : alert.level === 'error' ? '错误' : '警告'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                          <span>设备: {alert.deviceSerial}</span>
                          <span>{new Date(alert.createdAt).toLocaleString('zh-CN')}</span>
                        </div>
                      </div>

                      {alert.status === 'pending' && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleAlert(alert.id, 'processing')}
                            className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                          >
                            处理
                          </button>
                          <button
                            onClick={() => handleAlert(alert.id, 'resolved')}
                            className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                          >
                            解决
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};
