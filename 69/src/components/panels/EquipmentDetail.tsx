import { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { X, Activity, Thermometer, Gauge, Zap, Waves, Clock, Info } from 'lucide-react';
import { useEquipmentStore } from '@/store/useEquipmentStore';
import { EquipmentParameter, HistoricalData } from '@/types';

const statusColors = {
  normal: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
  warning: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
  alarm: 'text-red-400 bg-red-500/20 border-red-500/30',
};

const paramIcons: Record<string, React.ReactNode> = {
  temperature: <Thermometer className="w-4 h-4" />,
  pressure: <Gauge className="w-4 h-4" />,
  power: <Zap className="w-4 h-4" />,
  vibration: <Waves className="w-4 h-4" />,
  speed: <Activity className="w-4 h-4" />,
};

export function EquipmentDetail() {
  const { selectedEquipment, selectEquipment } = useEquipmentStore();
  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);

  useEffect(() => {
    if (selectedEquipment) {
      const data: HistoricalData[] = [];
      const now = Date.now();
      for (let i = 59; i >= 0; i--) {
        const timestamp = new Date(now - i * 60000).toISOString();
        const values: Record<string, number> = {};
        selectedEquipment.parameters.forEach((param) => {
          const baseValue = param.value;
          const variation = (Math.random() - 0.5) * baseValue * 0.1;
          values[param.name] = baseValue + variation;
        });
        data.push({ timestamp, values });
      }
      setHistoricalData(data);
    }
  }, [selectedEquipment?.id]);

  if (!selectedEquipment) return null;

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
    },
    legend: {
      data: selectedEquipment.parameters.map((p) => p.name),
      textStyle: { color: '#94a3b8' },
      top: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: historicalData.map((d) =>
        new Date(d.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      ),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: selectedEquipment.parameters.map((param, idx) => ({
      name: param.name,
      type: 'line',
      smooth: true,
      symbol: 'none',
      data: historicalData.map((d) => d.values[param.name]),
      lineStyle: {
        color: ['#06b6d4', '#10b981', '#f59e0b', '#ef4444'][idx % 4],
        width: 2,
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: `${['#06b6d4', '#10b981', '#f59e0b', '#ef4444'][idx % 4]}33` },
            { offset: 1, color: `${['#06b6d4', '#10b981', '#f59e0b', '#ef4444'][idx % 4]}00` },
          ],
        },
      },
    })),
  };

  return (
    <div className="absolute top-[420px] right-4 w-96 z-10">
      <div className="bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/50 shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="font-medium text-slate-200">{selectedEquipment.name}</div>
              <div className="text-xs text-slate-500">{selectedEquipment.type}</div>
            </div>
          </div>
          <button
            onClick={() => selectEquipment(null)}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-400">{selectedEquipment.description}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {selectedEquipment.parameters.map((param: EquipmentParameter, idx: number) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border ${statusColors[param.status]}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {paramIcons[param.name.toLowerCase()] || <Activity className="w-4 h-4" />}
                  <span className="text-xs font-medium">{param.name}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono">{param.value.toFixed(1)}</span>
                  <span className="text-xs opacity-70">{param.unit}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-400">参数趋势（近1小时）</span>
            </div>
            <div className="h-48">
              <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
