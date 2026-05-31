import { SEVERITY_LABELS, FAULT_TYPE_LABELS, SEVERITY_COLORS } from '../../../shared/types';
import type { FaultClassification } from '../../../shared/types';

interface Props {
  classification: FaultClassification;
}

const severityBg: Record<string, string> = {
  low: 'bg-thermal-green/20 text-thermal-green',
  medium: 'bg-thermal-orange/20 text-thermal-orange',
  high: 'bg-thermal-red/20 text-thermal-red',
  critical: 'bg-red-900/30 text-red-400 animate-pulse',
};

export default function FaultDetail({ classification }: Props) {
  const color = SEVERITY_COLORS[classification.severity];

  return (
    <div className="bg-dark-800 rounded-xl p-5 border border-dark-700 space-y-4">
      <div>
        <h4 className="text-sm text-neutral-400 mb-1">故障类型</h4>
        <p className="text-lg font-semibold">
          {FAULT_TYPE_LABELS[classification.faultType]}
        </p>
      </div>
      <div>
        <h4 className="text-sm text-neutral-400 mb-1">严重等级</h4>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${severityBg[classification.severity]}`}>
          {SEVERITY_LABELS[classification.severity]}
        </span>
      </div>
      <div>
        <h4 className="text-sm text-neutral-400 mb-1">置信度</h4>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${classification.confidence * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className="font-mono text-sm">{Math.round(classification.confidence * 100)}%</span>
        </div>
      </div>
      <div>
        <h4 className="text-sm text-neutral-400 mb-1">描述</h4>
        <p className="text-sm text-neutral-300">{classification.description}</p>
      </div>
      <div>
        <h4 className="text-sm text-neutral-400 mb-1">建议</h4>
        <p className="text-sm text-neutral-300">{classification.suggestion}</p>
      </div>
    </div>
  );
}
