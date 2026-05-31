import { type ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '../../shared/types';

type TrendDirection = 'up' | 'down' | 'neutral';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: number;
  trendLabel?: string;
  trendDirection?: TrendDirection;
  colorVariant?: 'default' | 'cyber' | 'success' | 'warning' | 'error';
  subtitle?: string;
  className?: string;
  onClick?: () => void;
}

const colorVariants = {
  default: {
    bg: 'bg-space-800/50',
    border: 'border-space-700',
    iconBg: 'bg-space-700',
    iconColor: 'text-space-400',
    valueColor: 'text-white',
    hover: 'hover:border-space-600',
  },
  cyber: {
    bg: 'bg-cyber-900/20',
    border: 'border-cyber-800/50',
    iconBg: 'bg-cyber-900/50',
    iconColor: 'text-cyber-400',
    valueColor: 'text-cyber-300',
    hover: 'hover:border-cyber-600',
  },
  success: {
    bg: 'bg-green-900/20',
    border: 'border-green-800/50',
    iconBg: 'bg-green-900/50',
    iconColor: 'text-green-400',
    valueColor: 'text-green-300',
    hover: 'hover:border-green-600',
  },
  warning: {
    bg: 'bg-yellow-900/20',
    border: 'border-yellow-800/50',
    iconBg: 'bg-yellow-900/50',
    iconColor: 'text-yellow-400',
    valueColor: 'text-yellow-300',
    hover: 'hover:border-yellow-600',
  },
  error: {
    bg: 'bg-red-900/20',
    border: 'border-red-800/50',
    iconBg: 'bg-red-900/50',
    iconColor: 'text-red-400',
    valueColor: 'text-red-300',
    hover: 'hover:border-red-600',
  },
};

const trendColors = {
  up: 'text-green-400',
  down: 'text-red-400',
  neutral: 'text-industrial-400',
};

export default function StatCard({
  title,
  value,
  icon,
  trend,
  trendLabel,
  trendDirection,
  colorVariant = 'default',
  subtitle,
  className,
  onClick,
}: StatCardProps) {
  const variant = colorVariants[colorVariant];

  const getTrendDirection = (): TrendDirection => {
    if (trendDirection) return trendDirection;
    if (trend === undefined) return 'neutral';
    if (trend > 0) return 'up';
    if (trend < 0) return 'down';
    return 'neutral';
  };

  const direction = getTrendDirection();
  const trendColor = trendColors[direction];

  const TrendIcon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;

  return (
    <div
      className={cn(
        'relative p-5 rounded-xl border backdrop-blur-sm transition-all duration-300 group',
        variant.bg,
        variant.border,
        variant.hover,
        onClick && 'cursor-pointer hover:scale-[1.02] hover:shadow-xl',
        className
      )}
      onClick={onClick}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />

      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-industrial-400 mb-1">{title}</h3>
            {subtitle && (
              <p className="text-xs text-industrial-500">{subtitle}</p>
            )}
          </div>
          {icon && (
            <div className={cn(
              'p-2.5 rounded-lg transition-transform duration-300 group-hover:scale-110',
              variant.iconBg
            )}>
              <div className={variant.iconColor}>{icon}</div>
            </div>
          )}
        </div>

        <div className="mb-3">
          <p className={cn(
            'text-3xl font-bold tabular-nums tracking-tight transition-colors',
            variant.valueColor
          )}>
            {value}
          </p>
        </div>

        {trend !== undefined && (
          <div className="flex items-center gap-2">
            <div className={cn(
              'flex items-center gap-1 text-sm font-medium',
              trendColor
            )}>
              <TrendIcon className="w-4 h-4" />
              <span>{Math.abs(trend)}%</span>
            </div>
            {trendLabel && (
              <span className="text-xs text-industrial-500">{trendLabel}</span>
            )}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-current/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ color: variant.iconColor }} />
      </div>
    </div>
  );
}

interface StatCardGridProps {
  stats: Partial<DashboardStats>;
  className?: string;
}

export function StatCardGrid({ stats, className }: StatCardGridProps) {
  const statItems = [
    {
      title: '总节点数',
      value: stats.totalNodes ?? 0,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>,
      colorVariant: 'cyber' as const,
      trend: stats.onlineNodes ? (stats.onlineNodes / (stats.totalNodes || 1)) * 100 : 0,
      trendLabel: '在线率',
    },
    {
      title: '运行中任务',
      value: stats.runningTasks ?? 0,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      colorVariant: 'default' as const,
    },
    {
      title: '已完成任务',
      value: stats.completedTasks ?? 0,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      colorVariant: 'success' as const,
      trend: 12.5,
      trendLabel: '较昨日',
    },
    {
      title: '失败任务',
      value: stats.failedTasks ?? 0,
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      colorVariant: 'error' as const,
      trend: -5.2,
      trendLabel: '较昨日',
    },
  ];

  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4', className)}>
      {statItems.map((item, index) => (
        <StatCard key={index} {...item} />
      ))}
    </div>
  );
}

export type { TrendDirection, StatCardProps, StatCardGridProps };
