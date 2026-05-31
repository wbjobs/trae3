import { useState, useRef, useEffect, useCallback } from 'react';
import { SEVERITY_COLORS, FAULT_TYPE_LABELS } from '../../../shared/types';
import type { Detection, FaultClassification, FaultRegion } from '../../../shared/types';

interface Props {
  detection: Detection;
  annotationMode: boolean;
  onSelectFault: (classification: FaultClassification) => void;
  onRegionAdd: (region: Omit<FaultRegion, 'id' | 'detectionId'>) => void;
  onRegionDelete: (regionId: string) => void;
  onRegionUpdate: (regionId: string, updates: Partial<FaultRegion>) => void;
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string | null) => void;
}

const PLACEHOLDER_URL = "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=infrared%20thermal%20imaging%20of%20electrical%20equipment%20with%20hot%20spots&image_size=landscape_16_9";

export default function ResultViewer({
  detection,
  annotationMode,
  onSelectFault,
  onRegionAdd,
  onRegionDelete,
  onRegionUpdate,
  selectedRegionId,
  onSelectRegion,
}: Props) {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const imageUrl = detection.originalUrl || PLACEHOLDER_URL;

  const getRegionClassification = (regionId: string) =>
    detection.classifications.find(c => c.regionId === regionId);

  const getRelativeCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!annotationMode) return;
    const coords = getRelativeCoords(e);
    if (!coords) return;

    if (selectedRegionId) {
      const region = detection.regions.find(r => r.id === selectedRegionId);
      if (region) {
        const handleSize = 1;
        const isBottomRight =
          coords.x >= region.x + region.width - handleSize &&
          coords.x <= region.x + region.width + handleSize &&
          coords.y >= region.y + region.height - handleSize &&
          coords.y <= region.y + region.height + handleSize;

        if (isBottomRight) {
          setIsResizing(true);
          setResizeHandle('br');
          return;
        }

        const isInside =
          coords.x >= region.x &&
          coords.x <= region.x + region.width &&
          coords.y >= region.y &&
          coords.y <= region.y + region.height;

        if (isInside) {
          setIsDragging(true);
          setDragOffset({
            x: coords.x - region.x,
            y: coords.y - region.y,
          });
          return;
        }
      }
    }

    onSelectRegion(null);
    setIsDrawing(true);
    setDrawStart(coords);
    setDrawEnd(coords);
  }, [annotationMode, selectedRegionId, detection.regions, getRelativeCoords, onSelectRegion]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const coords = getRelativeCoords(e);
    if (!coords) return;

    if (isDrawing) {
      setDrawEnd(coords);
    } else if (isDragging && selectedRegionId && dragOffset) {
      const region = detection.regions.find(r => r.id === selectedRegionId);
      if (region) {
        const newX = Math.max(0, Math.min(100 - region.width, coords.x - dragOffset.x));
        const newY = Math.max(0, Math.min(100 - region.height, coords.y - dragOffset.y));
        onRegionUpdate(selectedRegionId, { x: newX, y: newY });
      }
    } else if (isResizing && selectedRegionId && resizeHandle === 'br') {
      const region = detection.regions.find(r => r.id === selectedRegionId);
      if (region) {
        const newWidth = Math.max(1, Math.min(100 - region.x, coords.x - region.x));
        const newHeight = Math.max(1, Math.min(100 - region.y, coords.y - region.y));
        onRegionUpdate(selectedRegionId, { width: newWidth, height: newHeight });
      }
    }
  }, [isDrawing, isDragging, isResizing, selectedRegionId, dragOffset, resizeHandle, detection.regions, getRelativeCoords, onRegionUpdate]);

  const handleMouseUp = useCallback(() => {
    if (isDrawing && drawStart && drawEnd) {
      const x = Math.min(drawStart.x, drawEnd.x);
      const y = Math.min(drawStart.y, drawEnd.y);
      const width = Math.abs(drawEnd.x - drawStart.x);
      const height = Math.abs(drawEnd.y - drawStart.y);

      if (width > 1 && height > 1) {
        onRegionAdd({
          x,
          y,
          width,
          height,
          confidence: 1,
          isManual: true,
        });
      }
    }
    setIsDrawing(false);
    setDrawStart(null);
    setDrawEnd(null);
    setIsDragging(false);
    setDragOffset(null);
    setIsResizing(false);
    setResizeHandle(null);
  }, [isDrawing, drawStart, drawEnd, onRegionAdd]);

  useEffect(() => {
    if (annotationMode) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [annotationMode, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedRegionId && annotationMode) {
        onRegionDelete(selectedRegionId);
        onSelectRegion(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRegionId, annotationMode, onRegionDelete, onSelectRegion]);

  const handleRegionClick = (region: FaultRegion, e: React.MouseEvent) => {
    e.stopPropagation();
    if (annotationMode) {
      onSelectRegion(region.id === selectedRegionId ? null : region.id);
    } else {
      const cls = getRegionClassification(region.id);
      if (cls) onSelectFault(cls);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative rounded-xl overflow-hidden border border-dark-700 ${
        annotationMode ? 'cursor-crosshair' : ''
      }`}
      onMouseDown={handleMouseDown}
    >
      <img
        src={imageUrl}
        alt={detection.filename}
        className="w-full h-auto select-none pointer-events-none"
        draggable={false}
      />
      {detection.regions.map((region) => {
        const cls = getRegionClassification(region.id);
        const severity = cls?.severity || 'medium';
        const color = SEVERITY_COLORS[severity];
        const isHovered = hoveredRegion === region.id;
        const isSelected = region.id === selectedRegionId;

        return (
          <div
            key={region.id}
            className={`absolute transition-all duration-200 ${
              annotationMode ? 'cursor-move' : 'cursor-pointer'
            }`}
            style={{
              left: `${region.x}%`,
              top: `${region.y}%`,
              width: `${region.width}%`,
              height: `${region.height}%`,
              border: `${isSelected ? 3 : 2}px ${region.isManual ? 'dashed' : 'solid'} ${color}`,
              backgroundColor: isHovered || isSelected ? `${color}33` : `${color}1a`,
              boxShadow: isSelected ? `0 0 16px ${color}88` : isHovered ? `0 0 12px ${color}66` : 'none',
            }}
            onMouseEnter={() => setHoveredRegion(region.id)}
            onMouseLeave={() => setHoveredRegion(null)}
            onClick={(e) => handleRegionClick(region, e)}
          >
            {region.isManual && (
              <span className="absolute -top-5 left-0 px-1.5 py-0.5 text-xs rounded bg-blue-500 text-white whitespace-nowrap">
                手动标注
              </span>
            )}
            {(isHovered || isSelected) && cls && (
              <span
                className="absolute -top-6 left-0 px-2 py-0.5 text-xs rounded whitespace-nowrap text-white"
                style={{ backgroundColor: color }}
              >
                {FAULT_TYPE_LABELS[cls.faultType]} {Math.round(cls.confidence * 100)}%
              </span>
            )}
            {isSelected && annotationMode && (
              <>
                <div
                  className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border-2 rounded-full cursor-se-resize"
                  style={{ borderColor: color }}
                />
              </>
            )}
          </div>
        );
      })}
      {isDrawing && drawStart && drawEnd && (
        <div
          className="absolute border-2 border-dashed border-thermal-orange bg-thermal-orange/20 pointer-events-none"
          style={{
            left: `${Math.min(drawStart.x, drawEnd.x)}%`,
            top: `${Math.min(drawStart.y, drawEnd.y)}%`,
            width: `${Math.abs(drawEnd.x - drawStart.x)}%`,
            height: `${Math.abs(drawEnd.y - drawStart.y)}%`,
          }}
        />
      )}
    </div>
  );
}
