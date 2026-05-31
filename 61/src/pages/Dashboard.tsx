import { useEffect, useMemo, useRef, useState } from 'react';
import { useSensorStore } from '@/stores/sensor-store';
import { useWsStore } from '@/stores/ws-store';
import SensorCard from '@/components/SensorCard';
import StatusIndicator from '@/components/StatusIndicator';
import { Activity, AlertTriangle, WifiOff, Database } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TrendPoint {
  time: string;
  value: number;
}

export default function Dashboard() {
  const { sensors, fetchSensors } = useSensorStore();
  const { realtimeData, connect, subscribe, unsubscribe, sensorStatuses } = useWsStore();
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<Map<string, TrendPoint[]>>(new Map());
  const prevOnlineIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchSensors();
    connect();
  }, [fetchSensors, connect]);

  useEffect(() => {
    const currentOnlineIds = new Set(
      sensors.filter((s) => s.status === 'online').map((s) => s.id)
    );
    const prevIds = prevOnlineIdsRef.current;

    const toSubscribe: string[] = [];
    const toUnsubscribe: string[] = [];

    for (const id of currentOnlineIds) {
      if (!prevIds.has(id)) toSubscribe.push(id);
    }
    for (const id of prevIds) {
      if (!currentOnlineIds.has(id)) toUnsubscribe.push(id);
    }

    if (toSubscribe.length > 0) subscribe(toSubscribe);
    if (toUnsubscribe.length > 0) unsubscribe(toUnsubscribe);

    prevOnlineIdsRef.current = currentOnlineIds;
  }, [sensors, subscribe, unsubscribe]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTrendData((prev) => {
        const next = new Map(prev);
        realtimeData.forEach((data, sensorId) => {
          const arr = next.get(sensorId) || [];
          const point: TrendPoint = {
            time: new Date(data.timestamp).toLocaleTimeString(),
            value: data.value,
          };
          next.set(sensorId, [...arr.slice(-59), point]);
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [realtimeData]);

  const getEffectiveStatus = (sensor: { id: string; status: string }) => {
    const wsStatus = sensorStatuses.get(sensor.id);
    return wsStatus || sensor.status;
  };

  const stats = useMemo(() => {
    const online = sensors.filter((s) => getEffectiveStatus(s) === 'online').length;
    const alarm = sensors.filter((s) => getEffectiveStatus(s) === 'alarm').length;
    const offline = sensors.filter((s) => getEffectiveStatus(s) === 'offline').length;
    const totalPoints = Array.from(realtimeData.values()).length;
    return { online, alarm, offline, totalPoints };
  }, [sensors, realtimeData, sensorStatuses]);

  const alertSensors = useMemo(
    () => sensors.filter((s) => {
      const st = getEffectiveStatus(s);
      return st === 'alarm' || st === 'offline';
    }),
    [sensors, sensorStatuses]
  );

  const onlineSensors = useMemo(
    () => sensors.filter((s) => getEffectiveStatus(s) === 'online'),
    [sensors, sensorStatuses]
  );

  const selectedTrend = selectedSensorId ? trendData.get(selectedSensorId) || [] : [];

  const statCards = [
    { label: '在线传感器', value: stats.online, icon: Activity, color: 'text-status-online' },
    { label: '告警', value: stats.alarm, icon: AlertTriangle, color: 'text-status-alarm' },
    { label: '离线', value: stats.offline, icon: WifiOff, color: 'text-status-offline' },
    { label: '数据点', value: stats.totalPoints, icon: Database, color: 'text-accent' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <div
            key={s.label}
            className="animate-stagger-fade-in rounded border border-dark-border bg-dark-card p-4"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <s.icon size={16} className={s.color} />
              <span className="text-xs text-status-offline">{s.label}</span>
            </div>
            <div className={`font-mono text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-4">
        <div>
          <div className="text-sm font-mono text-status-offline mb-2">实时数据</div>
          <div className="grid grid-cols-3 gap-4">
            {onlineSensors.map((s) => (
              <div key={s.id} onClick={() => setSelectedSensorId(s.id)} className="cursor-pointer">
                <SensorCard sensor={s} latestData={realtimeData.get(s.id)} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-mono text-status-offline mb-2">告警面板</div>
          <div className="rounded border border-dark-border bg-dark-card p-3 space-y-2 max-h-[400px] overflow-auto">
            {alertSensors.length === 0 && (
              <div className="text-xs text-status-offline text-center py-4">暂无告警</div>
            )}
            {alertSensors.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded p-2 bg-dark-bg">
                <StatusIndicator status={getEffectiveStatus(s) as 'online' | 'offline' | 'alarm'} size={6} />
                <span className="text-xs text-white truncate flex-1">{s.name}</span>
                <span className="text-xs text-status-offline">{s.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-sm font-mono text-status-offline mb-2">
          趋势图 {selectedSensorId ? `- ${sensors.find((s) => s.id === selectedSensorId)?.name || ''}` : '（点击传感器查看）'}
        </div>
        <div className="rounded border border-dark-border bg-dark-card p-4 h-64">
          {selectedTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={selectedTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 4 }}
                  labelStyle={{ color: '#6b7280' }}
                />
                <Line type="monotone" dataKey="value" stroke="#00d2ff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-status-offline">
              点击传感器卡片查看趋势
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
