import { SEVERITY_LABELS } from '../../../shared/types';
import type { DetectionListItem } from '../../../shared/types';
import { ChevronRight, Square, CheckSquare } from 'lucide-react';

interface Props {
  items: DetectionListItem[];
  selectedIds: string[];
  onViewDetail: (item: DetectionListItem) => void;
  onToggleSelect: (id: string) => void;
}

const statusBadge: Record<string, string> = {
  processing: 'bg-yellow-900/30 text-yellow-400',
  completed: 'bg-thermal-green/20 text-thermal-green',
  failed: 'bg-thermal-red/20 text-thermal-red',
};

const severityBadge: Record<string, string> = {
  low: 'bg-thermal-green/20 text-thermal-green',
  medium: 'bg-thermal-orange/20 text-thermal-orange',
  high: 'bg-thermal-red/20 text-thermal-red',
  critical: 'bg-red-900/30 text-red-400 animate-pulse',
};

const statusLabels: Record<string, string> = {
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
};

export default function HistoryTable({ items, selectedIds, onViewDetail, onToggleSelect }: Props) {
  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-dark-700">
            <th className="text-center px-4 py-3 text-sm text-neutral-400 font-medium w-12">
              <span className="sr-only">选择</span>
            </th>
            <th className="text-left px-4 py-3 text-sm text-neutral-400 font-medium">文件名</th>
            <th className="text-center px-4 py-3 text-sm text-neutral-400 font-medium">故障数</th>
            <th className="text-center px-4 py-3 text-sm text-neutral-400 font-medium">严重等级</th>
            <th className="text-center px-4 py-3 text-sm text-neutral-400 font-medium">状态</th>
            <th className="text-left px-4 py-3 text-sm text-neutral-400 font-medium">检测时间</th>
            <th className="text-center px-4 py-3 text-sm text-neutral-400 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <tr
                key={item.id}
                className={`border-b border-dark-700/50 transition-colors cursor-pointer ${
                  isSelected ? 'bg-thermal-orange/10' : 'hover:bg-dark-700/30'
                }`}
                onClick={() => onToggleSelect(item.id)}
              >
                <td className="px-4 py-3 text-center" onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}>
                  <button className="text-neutral-400 hover:text-thermal-orange transition-colors">
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-thermal-orange" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm font-mono">{item.filename}</td>
                <td className="px-4 py-3 text-sm text-center font-mono">{item.faultCount}</td>
                <td className="px-4 py-3 text-center">
                  {item.maxSeverity ? (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityBadge[item.maxSeverity]}`}>
                      {SEVERITY_LABELS[item.maxSeverity]}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-500">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[item.status]}`}>
                    {statusLabels[item.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-neutral-400">{item.createdAt.slice(0, 16)}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewDetail(item); }}
                    className="text-thermal-orange hover:text-thermal-red transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 inline" />
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">暂无数据</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
