import { useEffect, useRef, useState } from 'react';
import StatusIndicator from './StatusIndicator';
import type { Sensor } from '../../shared/types';

interface SensorCardProps {
  sensor: Sensor;
  latestData?: { value: number; timestamp: string } | undefined;
}

export default function SensorCard({ sensor, latestData }: SensorCardProps) {
  const [bouncing, setBouncing] = useState(false);
  const prevValue = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (latestData && prevValue.current !== undefined && latestData.value !== prevValue.current) {
      setBouncing(true);
      const t = setTimeout(() => setBouncing(false), 300);
      return () => clearTimeout(t);
    }
    prevValue.current = latestData?.value;
  }, [latestData]);

  return (
    <div className="group relative rounded border border-dark-border bg-dark-card p-4 transition-all hover:border-accent/40 hover:shadow-[0_0_12px_rgba(0,210,255,0.15)]">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-sm text-white truncate mr-2">{sensor.name}</span>
        <StatusIndicator status={sensor.status} size={8} />
      </div>
      <div className="text-xs text-status-offline mb-3">{sensor.type}</div>
      <div className="flex items-baseline gap-1">
        <span className={`font-mono text-2xl font-bold text-accent ${bouncing ? 'animate-number-bounce' : ''}`}>
          {latestData != null ? latestData.value.toFixed(1) : '--'}
        </span>
        <span className="text-xs text-status-offline">{sensor.unit}</span>
      </div>
      {latestData && (
        <div className="mt-2 text-xs text-status-offline">
          {new Date(latestData.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
