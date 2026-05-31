import { CheckSquare, MinusSquare, FileText, Download, Square } from 'lucide-react';

interface Props {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onExportPDF: () => void;
  onExportExcel: () => void;
}

export default function ExportToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onExportPDF,
  onExportExcel,
}: Props) {
  const isAllSelected = selectedCount === totalCount && totalCount > 0;
  const isPartialSelected = selectedCount > 0 && selectedCount < totalCount;
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex items-center gap-3 p-3 bg-dark-800 rounded-xl border border-dark-700">
      <button
        onClick={isAllSelected ? onDeselectAll : onSelectAll}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-dark-700 hover:bg-dark-600 text-neutral-300 transition-colors"
      >
        {isAllSelected ? (
          <CheckSquare className="w-4 h-4 text-thermal-orange" />
        ) : isPartialSelected ? (
          <MinusSquare className="w-4 h-4 text-thermal-orange" />
        ) : (
          <Square className="w-4 h-4" />
        )}
        {isAllSelected ? '取消全选' : '全选'}
      </button>
      <div className="h-5 w-px bg-dark-600" />
      <span className="text-sm text-neutral-400">
        已选择 <span className="text-thermal-orange font-medium">{selectedCount}</span> 条记录
      </span>
      <div className="flex-1" />
      <button
        onClick={onExportPDF}
        disabled={!hasSelection}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-dark-700 hover:bg-dark-600 text-neutral-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileText className="w-4 h-4" />
        导出 PDF
      </button>
      <button
        onClick={onExportExcel}
        disabled={!hasSelection}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-thermal-orange hover:bg-thermal-orange/80 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="w-4 h-4" />
        导出 Excel
      </button>
    </div>
  );
}
