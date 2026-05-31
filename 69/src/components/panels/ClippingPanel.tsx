import { Scissors, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useEquipmentStore } from '@/store/useEquipmentStore';

export function ClippingPanel() {
  const { clippingEnabled, clippingDirection, clippingPosition, setClippingEnabled, setClippingDirection, setClippingPosition } = useEquipmentStore();

  return (
    <div className="absolute bottom-16 left-4 w-64 z-10">
      <div className="bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/50 shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-cyan-400" />
            <span className="font-medium text-slate-200 text-sm">结构剖切</span>
          </div>
          <button
            onClick={() => setClippingEnabled(!clippingEnabled)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              clippingEnabled
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
            }`}
          >
            {clippingEnabled ? '开启' : '关闭'}
          </button>
        </div>

        {clippingEnabled && (
          <div className="p-4 space-y-4">
            <div>
              <div className="text-xs text-slate-400 mb-2">剖切方向</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setClippingDirection([0, -1, 0])}
                  className={`p-1.5 rounded-md text-xs flex items-center justify-center gap-1 ${
                    clippingDirection[1] === -1 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <ChevronDown className="w-3 h-3" /> Y-
                </button>
                <button
                  onClick={() => setClippingDirection([0, 1, 0])}
                  className={`p-1.5 rounded-md text-xs flex items-center justify-center gap-1 ${
                    clippingDirection[1] === 1 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <ChevronUp className="w-3 h-3" /> Y+
                </button>
                <button
                  onClick={() => setClippingDirection([1, 0, 0])}
                  className={`p-1.5 rounded-md text-xs flex items-center justify-center gap-1 ${
                    clippingDirection[0] === 1 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <ChevronRight className="w-3 h-3" /> X+
                </button>
                <button
                  onClick={() => setClippingDirection([-1, 0, 0])}
                  className={`p-1.5 rounded-md text-xs flex items-center justify-center gap-1 ${
                    clippingDirection[0] === -1 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <ChevronLeft className="w-3 h-3" /> X-
                </button>
                <button
                  onClick={() => setClippingDirection([0, 0, 1])}
                  className={`p-1.5 rounded-md text-xs flex items-center justify-center gap-1 ${
                    clippingDirection[2] === 1 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800/50 text-slate-400'
                  }`}
                >
                  Z+
                </button>
                <button
                  onClick={() => setClippingDirection([0, 0, -1])}
                  className={`p-1.5 rounded-md text-xs flex items-center justify-center gap-1 ${
                    clippingDirection[2] === -1 ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800/50 text-slate-400'
                  }`}
                >
                  Z-
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">剖切位置</span>
                <span className="text-xs text-cyan-400 font-mono">{clippingPosition.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="-2"
                max="3"
                step="0.05"
                value={clippingPosition}
                onChange={(e) => setClippingPosition(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            <button
              onClick={() => { setClippingDirection([0, -1, 0]); setClippingPosition(0.5); }}
              className="w-full py-1.5 rounded-md bg-slate-800/50 text-slate-400 text-xs flex items-center justify-center gap-1.5 hover:bg-slate-700/50 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              重置
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
