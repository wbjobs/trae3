import { CheckCircle } from 'lucide-react';

interface Props {
  stage: 'idle' | 'preprocessing' | 'inference' | 'classification' | 'completed';
}

const stages = [
  { key: 'preprocessing', label: '预处理' },
  { key: 'inference', label: 'AI推理' },
  { key: 'classification', label: '故障分类' },
];

export default function ProgressIndicator({ stage }: Props) {
  if (stage === 'idle') return null;

  const stageIndex = stages.findIndex(s => s.key === stage);
  const isCompleted = stage === 'completed';

  return (
    <div className="flex items-center gap-2 py-4">
      {stages.map((s, i) => {
        const done = isCompleted || i < stageIndex;
        const active = !isCompleted && s.key === stage;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all
              ${done ? 'bg-thermal-green/20 border-thermal-green/40 text-thermal-green' :
                active ? 'bg-thermal-orange/20 border-thermal-orange/40 text-thermal-orange animate-pulse' :
                'bg-dark-700 border-dark-600 text-neutral-500'}`}
            >
              {done ? <CheckCircle className="w-4 h-4" /> : <span className="w-4 h-4 rounded-full border-2" />}
              <span className="text-sm font-medium">{s.label}</span>
            </div>
            {i < stages.length - 1 && (
              <div className={`w-8 h-0.5 ${done ? 'bg-thermal-green' : 'bg-dark-600'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
