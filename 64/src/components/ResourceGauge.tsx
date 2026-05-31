import { Cpu, HardDrive, MemoryStick } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Node, NodeMetrics } from '../../shared/types';

interface GaugeConfig {
  value: number;
  label: string;
  icon: typeof Cpu;
  unit?: string;
  showLabel?: boolean;
}

interface ResourceGaugeProps {
  cpu?: number;
  memory?: number;
  disk?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  className?: string;
}

const sizeConfig = {
  sm: {
    container: 'w-20 h-20',
    strokeWidth: 4,
    iconSize: 'w-5 h-5',
    valueSize: 'text-sm',
    labelSize: 'text-xs',
  },
  md: {
    container: 'w-28 h-28',
    strokeWidth: 6,
    iconSize: 'w-6 h-6',
    valueSize: 'text-lg',
    labelSize: 'text-sm',
  },
  lg: {
    container: 'w-36 h-36',
    strokeWidth: 8,
    iconSize: 'w-8 h-8',
    valueSize: 'text-2xl',
    labelSize: 'text-base',
  },
};

function getColor(value: number): string {
  if (value >= 90) return '#ef4444';
  if (value >= 80) return '#eab308';
  return '#14b8a6';
}

function getGlowColor(value: number): string {
  if (value >= 90) return 'rgba(239, 68, 68, 0.5)';
  if (value >= 80) return 'rgba(234, 179, 8, 0.5)';
  return 'rgba(20, 184, 166, 0.5)';
}

function Gauge({
  value,
  label,
  icon: Icon,
  unit = '%',
  size = 'md',
  showLabel = true,
}: GaugeConfig & { size?: 'sm' | 'md' | 'lg'; showLabel?: boolean }) {
  const config = sizeConfig[size];
  const safeValue = Math.min(Math.max(value, 0), 100);
  const color = getColor(safeValue);
  const glowColor = getGlowColor(safeValue);

  const viewBoxSize = 100;
  const center = viewBoxSize / 2;
  const strokeWidth = config.strokeWidth * (viewBoxSize / parseInt(config.container.replace(/\D/g, '')));
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeValue / 100) * circumference;

  const isWarning = safeValue >= 80 && safeValue < 90;
  const isCritical = safeValue >= 90;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn('relative', config.container)}>
        <svg
          className="w-full h-full -rotate-90"
          viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(30, 41, 59, 0.8)"
            strokeWidth={strokeWidth}
          />

          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.5s ease-out, stroke 0.3s ease',
              filter: `drop-shadow(0 0 8px ${glowColor})`,
            }}
          />

          {isCritical && (
            <circle
              cx={center}
              cy={center}
              r={radius + strokeWidth / 2}
              fill="none"
              stroke={color}
              strokeWidth={1}
              opacity={0.3}
              className="animate-pulse"
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon
            className={cn(
              config.iconSize,
              'mb-1 transition-colors',
              isCritical ? 'text-red-400 animate-pulse' : isWarning ? 'text-yellow-400' : 'text-cyber-400'
            )}
          />
          <span
            className={cn(
              config.valueSize,
              'font-bold tabular-nums transition-colors',
              isCritical ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-white'
            )}
          >
            {Math.round(safeValue)}
            <span className="text-xs opacity-70 ml-0.5">{unit}</span>
          </span>
        </div>
      </div>

      {showLabel && (
        <span className={cn(
          config.labelSize,
          'font-medium text-industrial-400',
          isCritical && 'text-red-400',
          isWarning && 'text-yellow-400'
        )}>
          {label}
        </span>
      )}
    </div>
  );
}

export default function ResourceGauge({
  cpu = 0,
  memory = 0,
  disk = 0,
  size = 'md',
  showLabels = true,
  className,
}: ResourceGaugeProps) {
  const gauges = [
    { value: cpu, label: 'CPU', icon: Cpu },
    { value: memory, label: '内存', icon: MemoryStick },
    { value: disk, label: '磁盘', icon: HardDrive },
  ];

  return (
    <div className={cn('grid grid-cols-3 gap-6', className)}>
      {gauges.map((gauge) => (
        <Gauge
          key={gauge.label}
          {...gauge}
          size={size}
          showLabel={showLabels}
        />
      ))}
    </div>
  );
}

interface NodeResourceGaugeProps {
  node: Node | NodeMetrics;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  className?: string;
}

export function NodeResourceGauge({
  node,
  size = 'md',
  showLabels = true,
  className,
}: NodeResourceGaugeProps) {
  const isNodeMetrics = 'nodeId' in node;

  return (
    <ResourceGauge
      cpu={isNodeMetrics ? node.cpu : node.cpuUsage}
      memory={isNodeMetrics ? node.memory : node.memoryUsage}
      disk={isNodeMetrics ? node.disk : node.diskUsage}
      size={size}
      showLabels={showLabels}
      className={className}
    />
  );
}

interface ResourceGaugeCardProps extends ResourceGaugeProps {
  title?: string;
  subtitle?: string;
  className?: string;
}

export function ResourceGaugeCard({
  title = '资源使用情况',
  subtitle,
  cpu,
  memory,
  disk,
  size = 'md',
  showLabels = true,
  className,
}: ResourceGaugeCardProps) {
  const hasWarning = (cpu ?? 0) >= 80 || (memory ?? 0) >= 80 || (disk ?? 0) >= 80;
  const hasCritical = (cpu ?? 0) >= 90 || (memory ?? 0) >= 90 || (disk ?? 0) >= 90;

  return (
    <div className={cn(
      'rounded-xl border bg-space-900/50 backdrop-blur-sm p-5 transition-all',
      hasCritical
        ? 'border-red-800/50 shadow-lg shadow-red-900/20'
        : hasWarning
        ? 'border-yellow-800/50'
        : 'border-space-700 hover:border-space-600',
      className
    )}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-industrial-200">{title}</h3>
        {subtitle && (
          <p className="text-xs text-industrial-500 mt-1">{subtitle}</p>
        )}
      </div>

      <ResourceGauge
        cpu={cpu}
        memory={memory}
        disk={disk}
        size={size}
        showLabels={showLabels}
      />

      {(hasWarning || hasCritical) && (
        <div className={cn(
          'mt-4 p-2 rounded-lg text-xs flex items-center gap-2',
          hasCritical
            ? 'bg-red-900/30 text-red-400 border border-red-800/50'
            : 'bg-yellow-900/30 text-yellow-400 border border-yellow-800/50'
        )}>
          <span className={cn(
            'w-2 h-2 rounded-full',
            hasCritical ? 'bg-red-400 animate-pulse' : 'bg-yellow-400'
          )} />
          <span>
            {hasCritical
              ? '警告：部分资源使用率超过90%，请及时处理！'
              : '提示：部分资源使用率超过80%，请注意监控。'}
          </span>
        </div>
      )}
    </div>
  );
}

export type { ResourceGaugeProps, NodeResourceGaugeProps, ResourceGaugeCardProps, GaugeConfig };
