import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Filter, Calendar, MapPin, Activity, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { DataFilter as DataFilterType, AreaInfo } from '../../types';
import { useDebounce } from '../../hooks/useDebounce';

interface DataFilterPanelProps {
  areas: AreaInfo[];
  onFilterChange: (filter: DataFilterType) => void;
  defaultFilter?: DataFilterType;
}

export const DataFilterPanel: React.FC<DataFilterPanelProps> = ({
  areas,
  onFilterChange,
  defaultFilter = {}
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState<DataFilterType>(defaultFilter);
  const debouncedFilter = useDebounce(filter, 300);
  const onFilterChangeRef = useRef(onFilterChange);

  useEffect(() => {
    onFilterChangeRef.current = onFilterChange;
  }, [onFilterChange]);

  useEffect(() => {
    onFilterChangeRef.current(debouncedFilter);
  }, [debouncedFilter]);

  const handleChange = useCallback((key: keyof DataFilterType, value: any) => {
    setFilter(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleBatchChange = useCallback((updates: Partial<DataFilterType>) => {
    setFilter(prev => ({ ...prev, ...updates }));
  }, []);

  const handleReset = useCallback(() => {
    setFilter({});
  }, []);

  const hasActiveFilters = Object.values(filter).some(v => v !== undefined && v !== '');

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div
        className="px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Filter className="w-4 h-4 text-blue-600" />
            </div>
            <span className="font-semibold text-gray-800">数据筛选</span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs font-medium rounded-full">
                已筛选
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
                <Search className="w-4 h-4" />
                关键词搜索
              </label>
              <input
                type="text"
                value={filter.keyword || ''}
                onChange={(e) => handleChange('keyword', e.target.value || undefined)}
                placeholder="搜索设备编号..."
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
                <MapPin className="w-4 h-4" />
                所属区域
              </label>
              <select
                value={filter.areaId || ''}
                onChange={(e) => handleChange('areaId', e.target.value || undefined)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              >
                <option value="">全部区域</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
                <Activity className="w-4 h-4" />
                设备状态
              </label>
              <select
                value={filter.status || ''}
                onChange={(e) => handleChange('status', e.target.value || undefined)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              >
                <option value="">全部状态</option>
                <option value="normal">正常</option>
                <option value="warning">告警</option>
                <option value="error">故障</option>
                <option value="offline">离线</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
                <Calendar className="w-4 h-4" />
                时间范围
              </label>
              <select
                value={
                  filter.startTime && filter.endTime
                    ? filter.endTime - filter.startTime === 3600000
                      ? '1h'
                      : filter.endTime - filter.startTime === 86400000
                      ? '24h'
                      : filter.endTime - filter.startTime === 604800000
                      ? '7d'
                      : filter.endTime - filter.startTime === 2592000000
                      ? '30d'
                      : ''
                    : ''
                }
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) {
                    const endTime = Date.now();
                    let startTime = endTime;
                    switch (value) {
                      case '1h': startTime = endTime - 3600000; break;
                      case '24h': startTime = endTime - 86400000; break;
                      case '7d': startTime = endTime - 604800000; break;
                      case '30d': startTime = endTime - 2592000000; break;
                    }
                    handleBatchChange({ startTime, endTime });
                  } else {
                    handleBatchChange({ startTime: undefined, endTime: undefined });
                  }
                }}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
              >
                <option value="">全部时间</option>
                <option value="1h">最近1小时</option>
                <option value="24h">最近24小时</option>
                <option value="7d">最近7天</option>
                <option value="30d">最近30天</option>
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">已选筛选条件:</span>
                <div className="flex flex-wrap gap-2">
                  {filter.keyword && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                      关键词: {filter.keyword}
                      <button
                        onClick={() => handleChange('keyword', undefined)}
                        className="hover:text-gray-800"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {filter.areaId && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                      区域: {areas.find((a) => a.id === filter.areaId)?.name}
                      <button
                        onClick={() => handleChange('areaId', undefined)}
                        className="hover:text-gray-800"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {filter.status && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                      状态: {filter.status}
                      <button
                        onClick={() => handleChange('status', undefined)}
                        className="hover:text-gray-800"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                重置筛选
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
