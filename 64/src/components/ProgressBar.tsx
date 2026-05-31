import { cn } from '@/lib/utils';

type ProgressVariant = 'default' | 'success' | 'warning' | 'error' | 'cyber';

interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  labelPosition?: 'inside' | 'outside' | 'right';
  variant?: ProgressVariant;
  height?: 'sm' | 'md' | 'lg' | 'xl';
  striped?: boolean;
  animated?: boolean;
  className?: string;
}

const variantConfig: Record<ProgressVariant, { bg: string; fill: string; glow?: string }> = {
  default: {
    bg: 'bg-space-800',
    fill: 'bg-gradient-to-r from-space-500 to-space-400',
  },
  success: {
    bg: 'bg-space-800',
    fill: 'bg-gradient-to-r from-green-600 to-green-400',
    glow: 'shadow-green-500/30',
  },
  warning: {
    bg: 'bg-space-800',
    fill: 'bg-gradient-to-r from-yellow-600 to-yellow-400',
    glow: 'shadow-yellow-500/30',
  },
  error: {
    bg: 'bg-space-800',
    fill: 'bg-gradient-to-r from-red-600 to-red-400',
    glow: 'shadow-red-500/30',
  },
  cyber: {
    bg: 'bg-space-800',
    fill: 'bg-gradient-to-r from-cyber-600 to-cyber-400',
    glow: 'shadow-cyber-500/30',
  },
};

const heightConfig = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
  xl: 'h-6',
};

export default function ProgressBar({
  value,
  max = 100,
  showLabel = true,
  labelPosition = 'right',
  variant = 'default',
  height = 'md',
  striped = false,
  animated = false,
  className,
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const displayValue = Math.round(percentage);

  const getVariant = (): ProgressVariant => {
    if (variant !== 'default') return variant;
    if (percentage >= 90) return 'error';
    if (percentage >= 70) return 'warning';
    if (percentage >= 100) return 'success';
    return variant;
  };

  const currentConfig = variantConfig[getVariant()];

  const labelContent = (
    <span className={cn(
      'text-xs font-semibold tabular-nums',
      labelPosition === 'inside' ? 'text-white' : 'text-industrial-300'
    )}>
      {displayValue}%
    </span>
  );

  return (
    <div className={cn('w-full', className)}>
      <div className={cn(
        'flex items-center gap-3',
        labelPosition === 'outside' && 'flex-col items-start'
      )}>
        {labelPosition === 'outside' && showLabel && (
          <div className="flex justify-between w-full mb-1">
            <span className="text-xs text-industrial-400">进度</span>
            {labelContent}
          </div>
        )}

        <div className="relative w-full">
          <div
            className={cn(
              'w-full rounded-full overflow-hidden relative',
              currentConfig.bg,
              heightConfig[height]
            )}
            role="progressbar"
            aria-valuenow={displayValue}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500 ease-out relative',
                currentConfig.fill,
                currentConfig.glow && 'shadow-lg',
                striped && 'bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem]',
                animated && 'animate-progress'
              )}
              style={{ width: `${percentage}%` }}
            >
              {labelPosition === 'inside' && showLabel && percentage > 15 && (
                <div className="absolute inset-0 flex items-center justify-end pr-2">
                  {labelContent}
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          </div>

          {labelPosition === 'right' && showLabel && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12">
              {labelContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TaskProgress({ value, max, showLabel = true, height = 'md' }: Omit<ProgressBarProps, 'variant' | 'striped' | 'animated'>) {
  const percentage = (value / (max || 100)) * 100;
  let variant: ProgressVariant = 'cyber';
  if (percentage >= 100) variant = 'success';
  else if (percentage < 0) variant = 'error';

  return (
    <ProgressBar
      value={value}
      max={max}
      showLabel={showLabel}
      variant={variant}
      height={height}
      striped={percentage < 100 && percentage > 0}
      animated={percentage < 100 && percentage > 0}
    />
  );
}

export function ResourceProgress({ value, max = 100, showLabel = true, height = 'md' }: Omit<ProgressBarProps, 'variant' | 'striped' | 'animated'>) {
  const percentage = (value / max) * 100;
  let variant: ProgressVariant = 'default';
  if (percentage >= 90) variant = 'error';
  else if (percentage >= 80) variant = 'warning';

  return (
    <ProgressBar
      value={value}
      max={max}
      showLabel={showLabel}
      labelPosition="right"
      variant={variant}
      height={height}
    />
  );
}

export type { ProgressVariant };
