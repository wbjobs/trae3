import { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import type { MetricDefinition, MetricSummary } from '@/types';
import { formatNumber, getTrendDirection, getValueStatus, getStatusColor } from '@/utils/format';
import { useMonitorStore } from '@/store/useMonitorStore';

interface MetricCardProps {
  metric: MetricDefinition;
  summary?: MetricSummary;
  delay?: number;
}

export default function MetricCard({ metric, summary, delay = 0 }: MetricCardProps) {
  const { latestData } = useMonitorStore();
  const [displayValue, setDisplayValue] = useState(0);
  const [prevValue, setPrevValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const valueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    const data = Array.from(latestData.values()).find(d => d.metric === metric.name);
    if (data) {
      setPrevValue(displayValue);
      setDisplayValue(data.value);
      if (valueRef.current) {
        valueRef.current.classList.remove('animate-pulse');
        void valueRef.current.offsetWidth;
        valueRef.current.classList.add('animate-pulse');
      }
    }
  }, [latestData, metric.name, displayValue]);

  const currentValue = summary?.value ?? displayValue;
  const avgValue = summary?.avg ?? 0;
  const status = getValueStatus(currentValue, metric.warn_threshold, metric.crit_threshold);
  const trend = getTrendDirection(currentValue, prevValue);
  const anomalyCount = summary?.anomaly_count ?? 0;

  const borderColor =
    status === 'critical'
      ? 'border-status-error/50 shadow-glow-red'
      : status === 'warning'
        ? 'border-status-warning/50 shadow-glow-orange'
        : 'border-border-glow hover:border-accent-cyan/50 hover:shadow-glow-cyan';

  return (
    <div
      className={`bg-bg-secondary/60 backdrop-blur-sm rounded-xl p-5 border transition-all duration-500 ${borderColor} ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      } ${status === 'critical' ? 'anomaly-pulse' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium text-gray-300">{metric.display_name}</h3>
          <p className="text-xs text-gray-500">{metric.name}</p>
        </div>
        {anomalyCount > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-status-error/20 text-status-error text-xs">
            <AlertTriangle className="w-3 h-3" />
            <span>{anomalyCount}次异常</span>
          </div>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div ref={valueRef} className="transition-all">
          <div
            className={`text-3xl font-bold font-number ${getStatusColor(status)}`}
          >
            {formatNumber(currentValue)}
            <span className="text-lg text-gray-500 ml-1">{metric.unit}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm">
            {trend === 'up' && (
              <TrendingUp className="w-4 h-4 text-status-error" />
            )}
            {trend === 'down' && (
              <TrendingDown className="w-4 h-4 text-status-success" />
            )}
            {trend === 'stable' && (
              <Minus className="w-4 h-4 text-gray-500" />
            )}
            <span className="text-gray-500">
              均值: {formatNumber(avgValue)}{metric.unit}
            </span>
          </div>
        </div>

        <div className="text-right text-xs text-gray-500">
          <div>阈值: {metric.warn_threshold}{metric.unit}</div>
          <div>临界: {metric.crit_threshold}{metric.unit}</div>
        </div>
      </div>

      <div className="mt-4 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            status === 'critical'
              ? 'bg-status-error'
              : status === 'warning'
                ? 'bg-status-warning'
                : 'bg-gradient-to-r from-accent-cyan to-status-success'
          }`}
          style={{
            width: `${Math.min(100, (currentValue / (metric.crit_threshold || 100)) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}
