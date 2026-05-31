import React from 'react';
import { AlertTriangle, Clock, CheckCircle, PlayCircle } from 'lucide-react';
import type { AlertInfo } from '../../types';

interface AlertListProps {
  alerts: AlertInfo[];
  onHandle?: (id: string, status: string) => void;
}

const levelConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  info: { color: 'text-blue-600', bgColor: 'bg-blue-50', label: '信息' },
  warning: { color: 'text-orange-600', bgColor: 'bg-orange-50', label: '警告' },
  error: { color: 'text-red-600', bgColor: 'bg-red-50', label: '错误' },
  critical: { color: 'text-red-700', bgColor: 'bg-red-100', label: '严重' }
};

const statusConfig: Record<string, { color: string; label: string; icon: React.ElementType }> = {
  pending: { color: 'text-orange-500', label: '待处理', icon: Clock },
  processing: { color: 'text-blue-500', label: '处理中', icon: PlayCircle },
  resolved: { color: 'text-green-500', label: '已解决', icon: CheckCircle }
};

export const AlertList: React.FC<AlertListProps> = ({ alerts, onHandle }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">最新告警</h3>
          <span className="text-sm text-gray-500">共 {alerts.length} 条</span>
        </div>
      </div>
      <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无告警信息</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const level = levelConfig[alert.level] || levelConfig.info;
            const status = statusConfig[alert.status] || statusConfig.pending;
            const StatusIcon = status.icon;

            return (
              <div
                key={alert.id}
                className="px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${level.bgColor} ${level.color}`}
                      >
                        {level.label}
                      </span>
                      <span className="text-sm font-medium text-gray-800">
                        {alert.deviceSerial}
                      </span>
                      <div className={`flex items-center gap-1 ${status.color}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        <span className="text-xs">{status.label}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{alert.message}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>告警类型: {alert.type}</span>
                      <span>
                        {new Date(alert.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                  </div>
                  {alert.status === 'pending' && onHandle && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onHandle(alert.id, 'processing')}
                        className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        开始处理
                      </button>
                      <button
                        onClick={() => onHandle(alert.id, 'resolved')}
                        className="px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        标记解决
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
