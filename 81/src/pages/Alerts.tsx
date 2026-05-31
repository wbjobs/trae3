import React, { useEffect, useState } from 'react';
import { useDashboardStore } from '../stores/dashboardStore';
import { AlertList } from '../components/Dashboard/AlertList';
import type { DataFilter } from '../types';

export default function Alerts() {
  const { alerts, fetchAlerts, handleAlert } = useDashboardStore();
  const [filter, setFilter] = useState<DataFilter>({});

  useEffect(() => {
    fetchAlerts(filter);
  }, [fetchAlerts, filter]);

  const handleFilterChange = (key: keyof DataFilter, value: any) => {
    const newFilter = { ...filter, [key]: value };
    setFilter(newFilter);
    fetchAlerts(newFilter);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">告警筛选</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">告警状态</label>
            <select
              value={filter.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
            >
              <option value="">全部状态</option>
              <option value="pending">待处理</option>
              <option value="processing">处理中</option>
              <option value="resolved">已解决</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">告警级别</label>
            <select
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
            >
              <option value="">全部级别</option>
              <option value="info">信息</option>
              <option value="warning">警告</option>
              <option value="error">错误</option>
              <option value="critical">严重</option>
            </select>
          </div>
        </div>
      </div>

      {alerts && <AlertList alerts={alerts.list} onHandle={handleAlert} />}
    </div>
  );
}
