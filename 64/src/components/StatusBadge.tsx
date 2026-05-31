import { cn } from '@/lib/utils';
import { TaskStatus, NodeStatus } from '../../shared/types';

type TaskStatusType = TaskStatus | 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'recovering' | 'preempted';
type NodeStatusType = NodeStatus | 'online' | 'offline' | 'busy' | 'error';
type AlertLevelType = 'info' | 'warning' | 'error' | 'critical';

type StatusType = TaskStatusType | NodeStatusType | AlertLevelType;

interface StatusBadgeProps {
  status: StatusType;
  type?: 'task' | 'node' | 'alert';
  showDot?: boolean;
  className?: string;
}

const taskStatusConfig: Record<TaskStatusType, { bg: string; text: string; dot: string; label: string; animation?: string }> = {
  pending: { bg: 'bg-industrial-700/50', text: 'text-industrial-300', dot: 'bg-industrial-400', label: '等待中' },
  queued: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', dot: 'bg-yellow-400', label: '排队中' },
  running: { bg: 'bg-cyber-900/30', text: 'text-cyber-400', dot: 'bg-cyber-400', label: '运行中', animation: 'animate-pulse' },
  recovering: { bg: 'bg-purple-900/30', text: 'text-purple-400', dot: 'bg-purple-400', label: '恢复中', animation: 'animate-pulse' },
  preempted: { bg: 'bg-amber-900/30', text: 'text-amber-400', dot: 'bg-amber-400', label: '被抢占', animation: 'animate-pulse' },
  completed: { bg: 'bg-green-900/30', text: 'text-green-400', dot: 'bg-green-400', label: '已完成' },
  failed: { bg: 'bg-red-900/30', text: 'text-red-400', dot: 'bg-red-400', label: '失败' },
  cancelled: { bg: 'bg-orange-900/30', text: 'text-orange-400', dot: 'bg-orange-400', label: '已取消' },
};

const nodeStatusConfig: Record<NodeStatusType, { bg: string; text: string; dot: string; label: string; animation?: string }> = {
  online: { bg: 'bg-green-900/30', text: 'text-green-400', dot: 'bg-green-400', label: '在线' },
  offline: { bg: 'bg-red-900/30', text: 'text-red-400', dot: 'bg-red-400', label: '离线' },
  busy: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', dot: 'bg-yellow-400', label: '繁忙', animation: 'animate-pulse' },
  error: { bg: 'bg-red-900/50', text: 'text-red-500', dot: 'bg-red-500', label: '错误', animation: 'animate-blink' },
};

const alertLevelConfig: Record<AlertLevelType, { bg: string; text: string; dot: string; label: string; animation?: string }> = {
  info: { bg: 'bg-blue-900/30', text: 'text-blue-400', dot: 'bg-blue-400', label: '信息' },
  warning: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', dot: 'bg-yellow-400', label: '警告' },
  error: { bg: 'bg-red-900/30', text: 'text-red-400', dot: 'bg-red-400', label: '错误' },
  critical: { bg: 'bg-red-900/50', text: 'text-red-500', dot: 'bg-red-500', label: '严重', animation: 'animate-blink' },
};

const statusLabels: Record<string, string> = {
  pending: '等待中',
  queued: '排队中',
  running: '运行中',
  recovering: '恢复中',
  preempted: '被抢占',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  online: '在线',
  offline: '离线',
  busy: '繁忙',
  error: '错误',
  info: '信息',
  warning: '警告',
  critical: '严重',
};

export default function StatusBadge({ status, type = 'task', showDot = true, className }: StatusBadgeProps) {
  const getConfig = () => {
    if (type === 'node') {
      return nodeStatusConfig[status as NodeStatusType] || nodeStatusConfig.offline;
    }
    if (type === 'alert') {
      return alertLevelConfig[status as AlertLevelType] || alertLevelConfig.info;
    }
    return taskStatusConfig[status as TaskStatusType] || taskStatusConfig.pending;
  };

  const config = getConfig();
  const label = statusLabels[status as string] || String(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-200',
        config.bg,
        config.text,
        'border-current/20',
        className
      )}
    >
      {showDot && (
        <span className={cn('w-1.5 h-1.5 rounded-full', config.dot, config.animation)} />
      )}
      <span>{label}</span>
    </span>
  );
}

export function TaskStatusBadge({ status, showDot, className }: Omit<StatusBadgeProps, 'type'>) {
  return <StatusBadge status={status as TaskStatusType} type="task" showDot={showDot} className={className} />;
}

export function NodeStatusBadge({ status, showDot, className }: Omit<StatusBadgeProps, 'type'>) {
  return <StatusBadge status={status as NodeStatusType} type="node" showDot={showDot} className={className} />;
}

export function AlertLevelBadge({ status, showDot, className }: Omit<StatusBadgeProps, 'type'>) {
  return <StatusBadge status={status as AlertLevelType} type="alert" showDot={showDot} className={className} />;
}

export type { StatusType, TaskStatusType, NodeStatusType, AlertLevelType };
