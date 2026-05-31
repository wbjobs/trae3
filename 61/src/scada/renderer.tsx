import type { PanelComponent, Sensor } from '../../shared/types';
import { componentRegistry } from './registry';
import GaugeChart from '@/components/GaugeChart';
import StatusIndicator from '@/components/StatusIndicator';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts';

interface TrendPoint {
  time: string;
  [sensorId: string]: string | number;
}

export interface RenderContext {
  realtimeData: Map<string, { value: number; timestamp: string }>;
  sensorStatuses: Map<string, string>;
  sensors: Sensor[];
  trends: Map<string, TrendPoint[]>;
}

const SENSOR_COLORS = ['#00d2ff', '#2ed573', '#ffa502', '#ff4757', '#a855f7', '#f472b6'];

function resolveProp(props: Record<string, unknown>, keys: string[], fallback: unknown = ''): unknown {
  for (const key of keys) {
    if (props[key] !== undefined && props[key] !== null) return props[key];
  }
  return fallback;
}

export function renderScadaComponent(comp: PanelComponent, ctx: RenderContext): React.ReactNode {
  const def = componentRegistry[comp.type];
  const primaryBinding = comp.sensorBindings[0] || null;
  const boundSensor = primaryBinding ? ctx.sensors.find((s) => s.id === primaryBinding) : null;
  const liveData = primaryBinding ? ctx.realtimeData.get(primaryBinding) : undefined;

  const getEffectiveStatus = (sensorId: string) => {
    const wsStatus = ctx.sensorStatuses.get(sensorId);
    if (wsStatus) return wsStatus;
    const sensor = ctx.sensors.find((s) => s.id === sensorId);
    return sensor?.status ?? 'offline';
  };

  switch (comp.type) {
    case 'gauge': {
      const min = Number(resolveProp(comp.props, ['min', 'minValue', 'rangeMin'], boundSensor?.rangeMin ?? 0));
      const max = Number(resolveProp(comp.props, ['max', 'maxValue', 'rangeMax'], boundSensor?.rangeMax ?? 100));
      const unit = String(resolveProp(comp.props, ['unit'], boundSensor?.unit ?? ''));
      const title = String(resolveProp(comp.props, ['title', 'label', 'name'], boundSensor?.name ?? ''));
      return (
        <GaugeChart
          value={liveData?.value ?? 0}
          min={min}
          max={max}
          unit={unit}
          title={title}
          size={Math.min(comp.width, comp.height) || 160}
        />
      );
    }
    case 'chart': {
      const chartTitle = String(resolveProp(comp.props, ['title', 'label', 'name'], def.label));
      const chartType = String(resolveProp(comp.props, ['chartType'], 'line'));
      if (comp.sensorBindings.length === 0) {
        return (
          <div className="w-full h-full flex flex-col">
            <div className="text-xs font-mono text-status-offline mb-1">{chartTitle}</div>
            <div className="flex-1 flex items-center justify-center text-xs text-status-offline">无数据源</div>
          </div>
        );
      }

      const mergedData: TrendPoint[] = [];
      const maxLen = Math.max(
        ...comp.sensorBindings.map((sid) => ctx.trends.get(sid)?.length ?? 0),
        0
      );
      for (let i = 0; i < maxLen; i++) {
        const point: TrendPoint = { time: '' };
        for (const sid of comp.sensorBindings) {
          const arr = ctx.trends.get(sid);
          if (arr && arr[i]) {
            if (!point.time) point.time = arr[i].time;
            point[sid] = arr[i][sid] ?? 0;
          }
        }
        if (point.time) mergedData.push(point);
      }

      const ChartComponent = chartType === 'area' ? AreaChart : LineChart;

      return (
        <div className="w-full h-full flex flex-col">
          <div className="text-xs font-mono text-status-offline mb-1">{chartTitle}</div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ChartComponent data={mergedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 9 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 4 }} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#6b7280' }} />
                {comp.sensorBindings.map((sid, idx) => {
                  const sensor = ctx.sensors.find((s) => s.id === sid);
                  const color = SENSOR_COLORS[idx % SENSOR_COLORS.length];
                  if (chartType === 'area') {
                    return (
                      <Area
                        key={sid}
                        type="monotone"
                        dataKey={sid}
                        name={sensor?.name || sid}
                        stroke={color}
                        fill={color}
                        fillOpacity={0.15}
                        strokeWidth={2}
                        dot={false}
                      />
                    );
                  }
                  return (
                    <Line
                      key={sid}
                      type="monotone"
                      dataKey={sid}
                      name={sensor?.name || sid}
                      stroke={color}
                      strokeWidth={2}
                      dot={false}
                    />
                  );
                })}
              </ChartComponent>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }
    case 'indicator': {
      const status = primaryBinding ? getEffectiveStatus(primaryBinding) : 'offline';
      const indicatorLabel = String(resolveProp(comp.props, ['label', 'title', 'name'], boundSensor?.name ?? ''));
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <StatusIndicator status={status as 'online' | 'offline' | 'alarm'} size={20} />
          <span className="text-xs text-status-offline">{indicatorLabel}</span>
        </div>
      );
    }
    case 'text':
      return (
        <div className="flex items-center justify-center h-full text-sm text-white">
          {String(resolveProp(comp.props, ['content', 'text', 'label'], 'Text'))}
        </div>
      );
    case 'button':
      return (
        <div className="flex items-center justify-center h-full">
          <button className="h-8 px-4 rounded bg-accent-blue text-white text-xs hover:bg-accent-blue/80">
            {String(resolveProp(comp.props, ['label', 'title', 'text'], 'Button'))}
          </button>
        </div>
      );
    case 'valve': {
      const valveStatus = primaryBinding ? getEffectiveStatus(primaryBinding) : 'offline';
      const valveLabel = String(resolveProp(comp.props, ['label', 'title', 'name'], def.label));
      return (
        <div className="flex items-center justify-center h-full gap-2">
          <div className={`w-8 h-8 rounded-full border-2 ${
            valveStatus === 'online' ? 'border-status-online bg-status-online/20' : 'border-status-offline bg-status-offline/20'
          }`} />
          <span className="text-xs text-status-offline">{valveLabel}</span>
        </div>
      );
    }
    case 'pipe': {
      const pipeStatus = primaryBinding ? getEffectiveStatus(primaryBinding) : 'offline';
      return (
        <div className="flex items-center justify-center h-full">
          <div className={`w-full h-2 rounded ${
            pipeStatus === 'online' ? 'bg-accent' : 'bg-status-offline'
          }`} />
        </div>
      );
    }
    default:
      return null;
  }
}
