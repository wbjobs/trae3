import { SquarePlus, Trash2, Save, X } from 'lucide-react';

interface Props {
  isDrawingMode: boolean;
  onToggleDrawMode: () => void;
  onDeleteSelected: () => void;
  onSave: () => void;
  onCancel: () => void;
  hasSelectedRegion: boolean;
}

export default function AnnotationToolbar({
  isDrawingMode,
  onToggleDrawMode,
  onDeleteSelected,
  onSave,
  onCancel,
  hasSelectedRegion,
}: Props) {
  return (
    <div className="flex items-center gap-2 p-3 bg-dark-800 rounded-xl border border-dark-700">
      <div className="flex items-center gap-2 mr-4">
        <span className="text-sm text-neutral-400">标注模式</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          isDrawingMode 
            ? 'bg-thermal-orange/20 text-thermal-orange' 
            : 'bg-neutral-600/20 text-neutral-400'
        }`}>
          {isDrawingMode ? '绘制中' : '查看'}
        </span>
      </div>
      <button
        onClick={onToggleDrawMode}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
          isDrawingMode
            ? 'bg-thermal-orange text-white'
            : 'bg-dark-700 hover:bg-dark-600 text-neutral-300'
        }`}
      >
        <SquarePlus className="w-4 h-4" />
        绘制区域
      </button>
      <button
        onClick={onDeleteSelected}
        disabled={!hasSelectedRegion}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-dark-700 hover:bg-dark-600 text-neutral-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Trash2 className="w-4 h-4" />
        删除选中
      </button>
      <div className="flex-1" />
      <button
        onClick={onCancel}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-dark-700 hover:bg-dark-600 text-neutral-300 transition-colors"
      >
        <X className="w-4 h-4" />
        取消
      </button>
      <button
        onClick={onSave}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-thermal-orange hover:bg-thermal-orange/80 text-white transition-colors"
      >
        <Save className="w-4 h-4" />
        保存标注
      </button>
    </div>
  );
}
