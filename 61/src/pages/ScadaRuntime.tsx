import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePanelStore } from '@/stores/panel-store';
import { useWsStore } from '@/stores/ws-store';
import { useSensorStore } from '@/stores/sensor-store';
import { renderScadaComponent } from '@/scada/renderer';
import type { RenderContext } from '@/scada/renderer';

interface TrendPoint {
  time: string;
  [sensorId: string]: string | number;
}

export default function ScadaRuntime() {
  const { id } = useParams<{ id: string }>();
  const { currentPanel, fetchPanel } = usePanelStore();
  const { sensors, fetchSensors } = useSensorStore();
  const { realtimeData, connect, subscribe, unsubscribe, sensorStatuses } = useWsStore();
  const [trends, setTrends] = useState<Map<string, TrendPoint[]>>(new Map());

  useEffect(() => {
    if (id) fetchPanel(id);
    fetchSensors();
    connect();
  }, [id, fetchPanel, fetchSensors, connect]);

  useEffect(() => {
    if (!currentPanel) return;
    const allIds: string[] = [];
    currentPanel.components.forEach((c) => {
      c.sensorBindings.forEach((sid) => {
        if (!allIds.includes(sid)) allIds.push(sid);
      });
    });
    if (allIds.length > 0) {
      subscribe(allIds);
    }
    return () => {
      if (allIds.length > 0) unsubscribe(allIds);
    };
  }, [currentPanel, subscribe, unsubscribe]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTrends((prev) => {
        const next = new Map(prev);
        realtimeData.forEach((data, sensorId) => {
          const arr = next.get(sensorId) || [];
          const time = new Date(data.timestamp).toLocaleTimeString();
          next.set(sensorId, [
            ...arr.slice(-59),
            { time, [sensorId]: data.value },
          ]);
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [realtimeData]);

  const ctx: RenderContext = {
    realtimeData,
    sensorStatuses,
    sensors,
    trends,
  };

  if (!currentPanel) {
    return <div className="flex items-center justify-center h-64 text-sm text-status-offline">加载面板中...</div>;
  }

  return (
    <div className="relative w-full h-[calc(100vh-7rem)] overflow-auto bg-dark-bg">
      <div className="p-2 mb-2">
        <span className="font-mono text-sm text-white">{currentPanel.name}</span>
      </div>
      {currentPanel.components.map((comp) => (
        <div
          key={comp.id}
          className="absolute rounded border border-dark-border bg-dark-card overflow-hidden p-2"
          style={{
            left: comp.x,
            top: comp.y + 32,
            width: comp.width,
            height: comp.height,
          }}
        >
          {renderScadaComponent(comp, ctx)}
        </div>
      ))}
    </div>
  );
}
