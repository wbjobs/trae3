import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: { value: number; isUp: boolean };
  color?: string;
  delay?: number;
}

export default function StatsCard({
  title,
  value,
  icon,
  trend,
  color = '#06b6d4',
  delay = 0,
}: StatsCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [displayValue, setDisplayValue] = useState(0);
  const numericValue = typeof value === 'number' ? value : 0;

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (isVisible && typeof value === 'number') {
      const duration = 1000;
      const steps = 30;
      const increment = numericValue / steps;
      let current = 0;
      const timer = setInterval(() => {
        current += increment;
        if (current >= numericValue) {
          setDisplayValue(numericValue);
          clearInterval(timer);
        } else {
          setDisplayValue(Math.floor(current));
        }
      }, duration / steps);
      return () => clearInterval(timer);
    }
  }, [isVisible, value, numericValue]);

  const displayText = typeof value === 'number' ? displayValue.toLocaleString() : value;

  return (
    <div
      className={`bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-5 transition-all duration-500 hover:border-accent-cyan/50 hover:shadow-glow-cyan ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm">{title}</p>
          <p className="text-3xl font-bold mt-2 font-number" style={{ color }}>
            {displayText}
          </p>
          {trend && (
            <div className="flex items-center gap-1 mt-2 text-sm">
              <span className={trend.isUp ? 'text-status-error' : 'text-status-success'}>
                {trend.isUp ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-gray-500">较昨日</span>
            </div>
          )}
        </div>
        <div
          className="p-3 rounded-xl"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
