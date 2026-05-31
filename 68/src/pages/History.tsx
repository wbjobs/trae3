import { useState, useEffect, useCallback } from 'react';
import { useDetectionStore } from '@/stores/detectionStore';
import { History as HistoryIcon } from 'lucide-react';
import FilterBar from '@/components/history/FilterBar';
import HistoryTable from '@/components/history/HistoryTable';
import ExportToolbar from '@/components/history/ExportToolbar';
import DetailModal from '@/components/history/DetailModal';
import type { DetectionListItem } from '../../shared/types';

export default function History() {
  const {
    detectionList,
    totalDetections,
    selectedIds,
    fetchDetectionList,
    fetchDetection,
    currentDetection,
    toggleSelectId,
    clearSelection,
    exportSelected,
  } = useDetectionStore();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('');
  const [faultType, setFaultType] = useState('');
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<DetectionListItem | null>(null);
  const pageSize = 10;

  useEffect(() => {
    fetchDetectionList({ page, pageSize, startDate, endDate, status, faultType });
  }, [page, startDate, endDate, status, faultType, fetchDetectionList]);

  useEffect(() => {
    return () => clearSelection();
  }, [clearSelection]);

  const handleViewDetail = (item: DetectionListItem) => {
    setSelectedItem(item);
    fetchDetection(item.id);
  };

  const handleSelectAll = useCallback(() => {
    detectionList.forEach(item => {
      if (!selectedIds.includes(item.id)) {
        toggleSelectId(item.id);
      }
    });
  }, [detectionList, selectedIds, toggleSelectId]);

  const handleDeselectAll = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleExportPDF = useCallback(() => {
    exportSelected('pdf');
  }, [exportSelected]);

  const handleExportExcel = useCallback(() => {
    exportSelected('excel');
  }, [exportSelected]);

  const totalPages = Math.ceil(totalDetections / pageSize);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <HistoryIcon className="w-6 h-6 text-thermal-orange" />
        <h2 className="text-2xl font-bold">历史记录</h2>
      </div>
      <FilterBar
        startDate={startDate} endDate={endDate} status={status} faultType={faultType}
        onStartDateChange={setStartDate} onEndDateChange={setEndDate}
        onStatusChange={setStatus} onFaultTypeChange={setFaultType}
      />
      <ExportToolbar
        selectedCount={selectedIds.length}
        totalCount={detectionList.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onExportPDF={handleExportPDF}
        onExportExcel={handleExportExcel}
      />
      <HistoryTable
        items={detectionList}
        selectedIds={selectedIds}
        onViewDetail={handleViewDetail}
        onToggleSelect={toggleSelectId}
      />
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 bg-dark-700 rounded text-sm disabled:opacity-50 hover:bg-dark-600 transition-colors"
          >
            上一页
          </button>
          <span className="text-sm text-neutral-400">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 bg-dark-700 rounded text-sm disabled:opacity-50 hover:bg-dark-600 transition-colors"
          >
            下一页
          </button>
        </div>
      )}
      <DetailModal
        item={selectedItem}
        detection={currentDetection}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
