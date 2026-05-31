import { useState, useCallback } from 'react';
import { useDetectionStore } from '@/stores/detectionStore';
import UploadZone from '@/components/detect/UploadZone';
import ProgressIndicator from '@/components/detect/ProgressIndicator';
import ResultViewer from '@/components/detect/ResultViewer';
import FaultDetail from '@/components/detect/FaultDetail';
import AnnotationToolbar from '@/components/detect/AnnotationToolbar';
import { Thermometer, Edit3 } from 'lucide-react';
import type { FaultClassification, FaultRegion } from '../../shared/types';

export default function Detect() {
  const {
    currentDetection,
    uploadProgress,
    isUploading,
    detectionStage,
    annotationMode,
    uploadImages,
    resetDetection,
    setAnnotationMode,
    saveAnnotation,
  } = useDetectionStore();

  const [selectedFault, setSelectedFault] = useState<FaultClassification | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [editingRegions, setEditingRegions] = useState<FaultRegion[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  const hasResult = currentDetection && detectionStage === 'completed';

  const handleEnterAnnotationMode = () => {
    if (currentDetection) {
      setEditingRegions([...currentDetection.regions]);
      setAnnotationMode(true);
      setSelectedFault(null);
    }
  };

  const handleCancelAnnotation = () => {
    setAnnotationMode(false);
    setSelectedRegionId(null);
    setEditingRegions([]);
    setIsDrawingMode(false);
  };

  const handleSaveAnnotation = useCallback(() => {
    if (!currentDetection) return;
    const classifications = currentDetection.classifications.filter(c =>
      editingRegions.some(r => r.id === c.regionId)
    );
    saveAnnotation(editingRegions, classifications);
    setSelectedRegionId(null);
    setIsDrawingMode(false);
  }, [currentDetection, editingRegions, saveAnnotation]);

  const handleRegionAdd = useCallback((region: Omit<FaultRegion, 'id' | 'detectionId'>) => {
    if (!currentDetection) return;
    const newRegion: FaultRegion = {
      ...region,
      id: `manual_${Date.now()}`,
      detectionId: currentDetection.id,
    };
    setEditingRegions(prev => [...prev, newRegion]);
    setIsDrawingMode(false);
  }, [currentDetection]);

  const handleRegionDelete = useCallback((regionId: string) => {
    setEditingRegions(prev => prev.filter(r => r.id !== regionId));
  }, []);

  const handleRegionUpdate = useCallback((regionId: string, updates: Partial<FaultRegion>) => {
    setEditingRegions(prev => prev.map(r =>
      r.id === regionId ? { ...r, ...updates } : r
    ));
  }, []);

  const handleDeleteSelected = () => {
    if (selectedRegionId) {
      handleRegionDelete(selectedRegionId);
      setSelectedRegionId(null);
    }
  };

  const displayDetection = annotationMode && currentDetection
    ? { ...currentDetection, regions: editingRegions }
    : currentDetection;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Thermometer className="w-6 h-6 text-thermal-orange" />
          检测工作台
        </h2>
        {hasResult && !annotationMode && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleEnterAnnotationMode}
              className="flex items-center gap-1 px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              标注编辑
            </button>
            <button
              onClick={() => { resetDetection(); setSelectedFault(null); }}
              className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm transition-colors"
            >
              重新检测
            </button>
          </div>
        )}
      </div>

      {!currentDetection ? (
        <UploadZone onUpload={uploadImages} isUploading={isUploading} uploadProgress={uploadProgress} />
      ) : (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {annotationMode && displayDetection && (
            <AnnotationToolbar
              isDrawingMode={isDrawingMode}
              onToggleDrawMode={() => setIsDrawingMode(!isDrawingMode)}
              onDeleteSelected={handleDeleteSelected}
              onSave={handleSaveAnnotation}
              onCancel={handleCancelAnnotation}
              hasSelectedRegion={!!selectedRegionId}
            />
          )}
          <div className="flex-1 flex gap-4 min-h-0">
            <div className="flex-1 flex flex-col min-w-0">
              <ProgressIndicator stage={detectionStage} />
              {hasResult && displayDetection && (
                <ResultViewer
                  detection={displayDetection}
                  annotationMode={annotationMode && isDrawingMode}
                  onSelectFault={setSelectedFault}
                  onRegionAdd={handleRegionAdd}
                  onRegionDelete={handleRegionDelete}
                  onRegionUpdate={handleRegionUpdate}
                  selectedRegionId={selectedRegionId}
                  onSelectRegion={setSelectedRegionId}
                />
              )}
              {!hasResult && (
                <div className="flex-1 flex items-center justify-center bg-dark-800 rounded-xl border border-dark-700">
                  <div className="text-center">
                    <div className="w-12 h-12 border-2 border-thermal-orange border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-neutral-400">正在分析图像...</p>
                  </div>
                </div>
              )}
            </div>
            <div className="w-80 shrink-0">
              {selectedFault ? (
                <FaultDetail classification={selectedFault} />
              ) : (
                <div className="bg-dark-800 rounded-xl p-5 border border-dark-700 h-full flex items-center justify-center">
                  <p className="text-neutral-500 text-sm text-center">
                    {hasResult 
                      ? annotationMode 
                        ? '点击选择区域进行编辑，或点击"绘制区域"添加新区域' 
                        : '点击图像中的故障区域查看详情' 
                      : '等待检测结果...'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
