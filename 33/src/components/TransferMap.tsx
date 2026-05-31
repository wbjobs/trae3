import { useState, useEffect } from 'react';
import type { Lab, Transfer } from '@/types';
import { useLabStore } from '@/stores/labStore';
import { Search, X } from 'lucide-react';
import { api } from '@/utils/api';

interface TransferMapProps {
  onLabClick?: (lab: Lab) => void;
  onTransferSelect?: (transfer: Transfer) => void;
}

const FLOOR_HEIGHT = 220;
const NODE_WIDTH = 140;
const NODE_HEIGHT = 70;

export default function TransferMap({ onLabClick, onTransferSelect }: TransferMapProps) {
  const { labs, fetchLabs } = useLabStore();
  const [searchCode, setSearchCode] = useState('');
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);
  const [labSamples, setLabSamples] = useState<{ sampleCode: string; sampleName: string }[]>([]);

  useEffect(() => {
    fetchLabs();
    api.get<{ data: Transfer[]; total: number }>('/transfers?status=in_transit&pageSize=50')
      .then((res) => setTransfers(res.data || []))
      .catch(() => setTransfers([]));
  }, [fetchLabs]);

  useEffect(() => {
    if (selectedLab) {
      api.get<{ sampleCode: string; sampleName: string }[]>(`/labs/${selectedLab.id}/samples`).then(setLabSamples).catch(() => setLabSamples([]));
    }
  }, [selectedLab]);

  const floors = [3, 2, 1];
  const maxFloor = 3;
  const svgWidth = 900;
  const svgHeight = maxFloor * FLOOR_HEIGHT + 60;

  const getLabPosition = (lab: Lab) => ({
    x: lab.positionX * 180 + 60,
    y: (maxFloor - lab.floor) * FLOOR_HEIGHT + 40,
  });

  const handleLabClick = (lab: Lab) => {
    setSelectedLab(lab);
    onLabClick?.(lab);
  };

  const activeTransfers = transfers.filter(
    (t) => searchCode ? t.sampleCode.toLowerCase().includes(searchCode.toLowerCase()) : true
  );

  const getLabById = (id: number) => labs.find((l) => l.id === id);

  return (
    <div className="relative">
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            placeholder="搜索样本编号定位..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div className="overflow-auto rounded-xl bg-white shadow-sm">
        <svg width={svgWidth} height={svgHeight} className="min-w-[700px]">
          {floors.map((floor) => {
            const y = (maxFloor - floor) * FLOOR_HEIGHT + 20;
            return (
              <g key={floor}>
                <rect x={10} y={y} width={svgWidth - 20} height={FLOOR_HEIGHT - 20} rx={8} fill="#F1F5F9" stroke="#E2E8F0" strokeWidth={1} />
                <text x={25} y={y + 25} className="text-xs fill-gray-400" fontWeight="500">{floor}F</text>
              </g>
            );
          })}

          {activeTransfers.map((t) => {
            const fromLab = getLabById(t.fromLabId);
            const toLab = getLabById(t.toLabId);
            if (!fromLab || !toLab) return null;
            const from = getLabPosition(fromLab);
            const to = getLabPosition(toLab);
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2 - 30;
            return (
              <g key={t.id} className="cursor-pointer" onClick={() => onTransferSelect?.(t)}>
                <path
                  d={`M ${from.x + NODE_WIDTH / 2} ${from.y + NODE_HEIGHT / 2} Q ${midX} ${midY} ${to.x + NODE_WIDTH / 2} ${to.y + NODE_HEIGHT / 2}`}
                  fill="none"
                  stroke="#0EA5A0"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  className="animate-dash"
                />
                <circle
                  cx={midX}
                  cy={midY}
                  r={4}
                  fill="#0EA5A0"
                  className="animate-pulse"
                />
              </g>
            );
          })}

          {labs.map((lab) => {
            const pos = getLabPosition(lab);
            const isSelected = selectedLab?.id === lab.id;
            const utilRate = lab.capacity > 0 ? Math.round((lab.currentCount / lab.capacity) * 100) : 0;
            return (
              <g key={lab.id} className="cursor-pointer" onClick={() => handleLabClick(lab)}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={8}
                  fill={isSelected ? '#0EA5A0' : '#1E3A5F'}
                  stroke={isSelected ? '#0EA5A0' : 'none'}
                  strokeWidth={2}
                  className="transition-all"
                />
                <text x={pos.x + NODE_WIDTH / 2} y={pos.y + 25} textAnchor="middle" className="text-xs fill-white font-medium">
                  {lab.name}
                </text>
                <text x={pos.x + NODE_WIDTH / 2} y={pos.y + 45} textAnchor="middle" className="text-[10px] fill-white/70">
                  样本: {lab.currentCount}/{lab.capacity}
                </text>
                <rect x={pos.x + 15} y={pos.y + 52} width={NODE_WIDTH - 30} height={4} rx={2} fill="rgba(255,255,255,0.2)" />
                <rect x={pos.x + 15} y={pos.y + 52} width={(NODE_WIDTH - 30) * Math.min(utilRate, 100) / 100} height={4} rx={2} fill="rgba(255,255,255,0.8)" />
              </g>
            );
          })}
        </svg>
      </div>

      {selectedLab && (
        <div className="absolute right-4 top-16 w-64 rounded-xl bg-white p-4 shadow-lg animate-slideIn">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#1E3A5F]">{selectedLab.name}</h4>
            <button onClick={() => setSelectedLab(null)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-3 space-y-1 text-xs text-gray-500">
            <p>位置：{selectedLab.floor}F</p>
            <p>容量：{selectedLab.currentCount}/{selectedLab.capacity}</p>
            <p>联系人：{selectedLab.contactPerson}</p>
          </div>
          {labSamples.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-600">在库样本</p>
              <div className="space-y-1">
                {labSamples.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 text-xs">
                    <span className="font-mono text-[#1E3A5F]">{s.sampleCode}</span>
                    <span className="text-gray-500">{s.sampleName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
