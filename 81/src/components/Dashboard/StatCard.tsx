import React from 'react';
import {
  Gauge,
  Activity,
  Droplets,
  AlertTriangle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import type { StatCardData } from '../../types';

const iconMap: Record<string, React.ElementType> = {
  gauge: Gauge,
  activity: Activity,
  droplets: Droplets,
  alert: AlertTriangle
};

interface StatCardProps {
  data: StatCardData;
}

export const StatCard: React.FC<StatCardProps> = ({ data }) => {
  const IconComponent = iconMap[data.icon] || Activity;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-300">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 font-medium mb-1">{data.title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-800">
              {typeof data.value === 'number' ? data.value.toLocaleString() : data.value}
            </span>
            {data.unit && (
              <span className="text-sm text-gray-500">{data.unit}</span>
            )}
          </div>
          {data.trend !== undefined && (
            <div className="flex items-center mt-2">
              {data.trend >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span
                className={`text-xs font-medium ${
                  data.trend >= 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {data.trend >= 0 ? '+' : ''}
                {data.trend.toFixed(1)}%
              </span>
              <span className="text-xs text-gray-400 ml-1">较昨日</span>
            </div>
          )}
        </div>
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center ${data.color}`}
        >
          <IconComponent className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
};
