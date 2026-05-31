import { X } from 'lucide-react';
import { SEVERITY_COLORS, FAULT_TYPE_LABELS, SEVERITY_LABELS } from '../../../shared/types';
import type { Detection, DetectionListItem } from '../../../shared/types';

interface Props {
  item: DetectionListItem | null;
  detection: Detection | null;
  onClose: () => void;
}

const PLACEHOLDER_URL = "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=infrared%20thermal%20imaging%20of%20electrical%20equipment%20with%20hot%20spots&image_size=landscape_16_9";

export default function DetailModal({ item, detection, onClose }: Props) {
  if (!item) return null;

  const imageUrl = detection?.originalUrl || item.thumbnailUrl || PLACEHOLDER_URL;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dark-800 rounded-xl border border-dark-700 w-[800px] max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <h3 className="text-lg font-semibold">{item.filename}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <div className="relative rounded-lg overflow-hidden mb-4">
            <img src={imageUrl} alt={item.filename} className="w-full" />
            {detection?.regions.map((region) => {
              const cls = detection.classifications.find(c => c.regionId === region.id);
              const color = SEVERITY_COLORS[cls?.severity || 'medium'];
              return (
                <div
                  key={region.id}
                  className="absolute"
                  style={{
                    left: `${region.x}%`,
                    top: `${region.y}%`,
                    width: `${region.width}%`,
                    height: `${region.height}%`,
                    border: `2px solid ${color}`,
                    backgroundColor: `${color}1a`,
                  }}
                />
              );
            })}
          </div>
          {detection && detection.classifications.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm text-neutral-400">故障分类</h4>
              {detection.classifications.map((cls) => (
                <div key={cls.id} className="flex items-center gap-3 p-3 bg-dark-700 rounded-lg">
                  <span className="text-sm">{FAULT_TYPE_LABELS[cls.faultType]}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${SEVERITY_COLORS[cls.severity]}33`, color: SEVERITY_COLORS[cls.severity] }}
                  >
                    {SEVERITY_LABELS[cls.severity]}
                  </span>
                  <span className="text-xs font-mono text-neutral-400 ml-auto">
                    {Math.round(cls.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
