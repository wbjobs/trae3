import { useCallback, useEffect, useRef, useState } from 'react';
import { usePanelStore } from '@/stores/panel-store';
import { useSensorStore } from '@/stores/sensor-store';
import type { ComponentType, PanelComponent, ScadaPanel } from '../../shared/types';
import { componentRegistry, createDefaultProps } from '@/scada/registry';
import type { PropSchema } from '@/scada/registry';
import { Gauge, LineChart, Lightbulb, MousePointer2, Type, CircleDot, Minus, Save, Plus } from 'lucide-react';

const iconMap: Record<string, typeof Gauge> = {
  gauge: Gauge,
  'line-chart': LineChart,
  lightbulb: Lightbulb,
  'mouse-pointer-2': MousePointer2,
  type: Type,
  'circle-dot': CircleDot,
  minus: Minus,
};

export default function ScadaDesigner() {
  const { panels, currentPanel, fetchPanels, fetchPanel, createPanel, updatePanel } = usePanelStore();
  const { sensors, fetchSensors } = useSensorStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string>('');
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchPanels();
    fetchSensors();
  }, [fetchPanels, fetchSensors]);

  useEffect(() => {
    if (panels.length > 0 && !panelId) {
      setPanelId(panels[0].id);
      fetchPanel(panels[0].id);
    }
  }, [panels, panelId, fetchPanel]);

  useEffect(() => {
    if (panelId) fetchPanel(panelId);
  }, [panelId, fetchPanel]);

  const selectedComponent = currentPanel?.components.find((c) => c.id === selectedId);

  const handleDragStart = useCallback((e: React.DragEvent, type: ComponentType) => {
    e.dataTransfer.setData('componentType', type);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('componentType') as ComponentType;
      if (!type || !currentPanel) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const def = componentRegistry[type];
      const newComp: PanelComponent = {
        id: `comp_${Date.now()}`,
        type,
        x,
        y,
        width: def.defaultWidth,
        height: def.defaultHeight,
        props: createDefaultProps(type),
        sensorBindings: [],
      };
      updatePanel(currentPanel.id, {
        components: [...currentPanel.components, newComp],
      });
    },
    [currentPanel, updatePanel]
  );

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCompMouseDown = (e: React.MouseEvent, compId: string) => {
    e.stopPropagation();
    setSelectedId(compId);
    setDragging(true);
    const comp = currentPanel?.components.find((c) => c.id === compId);
    if (!comp) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStartRef.current = { x: e.clientX - comp.x, y: e.clientY - comp.y };
  };

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !selectedId || !currentPanel) return;
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      const updated = currentPanel.components.map((c) =>
        c.id === selectedId ? { ...c, x: Math.max(0, newX), y: Math.max(0, newY) } : c
      );
      updatePanel(currentPanel.id, { components: updated });
    },
    [dragging, selectedId, currentPanel, updatePanel]
  );

  const handleCanvasMouseUp = () => {
    setDragging(false);
  };

  const handleCanvasClick = () => {
    setSelectedId(null);
  };

  const handleSave = async () => {
    if (!currentPanel) return;
    await updatePanel(currentPanel.id, currentPanel);
  };

  const handleNewPanel = async () => {
    const data: Omit<ScadaPanel, 'id' | 'createdAt' | 'updatedAt'> = {
      name: `面板 ${panels.length + 1}`,
      description: '',
      layout: { cols: 12, rows: 8, gridGap: 8 },
      components: [],
    };
    await createPanel(data);
    if (panels.length > 0) {
      await fetchPanels();
      const last = usePanelStore.getState().panels;
      if (last.length > 0) {
        setPanelId(last[last.length - 1].id);
      }
    }
  };

  const updateCompProp = (key: string, value: unknown) => {
    if (!currentPanel || !selectedComponent) return;
    const updated = currentPanel.components.map((c) =>
      c.id === selectedComponent.id ? { ...c, props: { ...c.props, [key]: value } } : c
    );
    updatePanel(currentPanel.id, { components: updated });
  };

  const updateCompBinding = (sensorId: string) => {
    if (!currentPanel || !selectedComponent) return;
    const def = componentRegistry[selectedComponent.type];
    const bindings = selectedComponent.sensorBindings.includes(sensorId)
      ? selectedComponent.sensorBindings.filter((id) => id !== sensorId)
      : [...selectedComponent.sensorBindings, sensorId];
    const clamped = def.maxBindings > 0 ? bindings.slice(0, def.maxBindings) : bindings;
    const updated = currentPanel.components.map((c) =>
      c.id === selectedComponent.id ? { ...c, sensorBindings: clamped } : c
    );
    updatePanel(currentPanel.id, { components: updated });
  };

  const renderPropInput = (schema: PropSchema) => {
    const value = selectedComponent?.props[schema.key] ?? schema.defaultValue;
    if (schema.type === 'sensor_binding') {
      return (
        <div className="space-y-1 max-h-40 overflow-auto">
          {sensors.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={selectedComponent?.sensorBindings.includes(s.id) ?? false}
                onChange={() => updateCompBinding(s.id)}
                className="accent-accent"
              />
              <span className="text-white truncate">{s.name}</span>
            </label>
          ))}
        </div>
      );
    }
    if (schema.type === 'select') {
      return (
        <select
          value={String(value)}
          onChange={(e) => updateCompProp(schema.key, e.target.value)}
          className="w-full h-7 px-2 rounded border border-dark-border bg-dark-bg text-xs text-white focus:outline-none focus:border-accent"
        >
          {schema.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }
    if (schema.type === 'boolean') {
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => updateCompProp(schema.key, e.target.checked)}
          className="accent-accent"
        />
      );
    }
    if (schema.type === 'number') {
      return (
        <input
          type="number"
          value={Number(value)}
          onChange={(e) => updateCompProp(schema.key, Number(e.target.value))}
          className="w-full h-7 px-2 rounded border border-dark-border bg-dark-bg text-xs text-white focus:outline-none focus:border-accent"
        />
      );
    }
    return (
      <input
        value={String(value)}
        onChange={(e) => updateCompProp(schema.key, e.target.value)}
        className="w-full h-7 px-2 rounded border border-dark-border bg-dark-bg text-xs text-white focus:outline-none focus:border-accent"
      />
    );
  };

  return (
    <div className="flex h-[calc(100vh-7rem)]">
      <div className="w-48 border-r border-dark-border bg-dark-card p-3 space-y-2 overflow-auto">
        <div className="text-xs font-mono text-status-offline mb-2">组件</div>
        {(Object.values(componentRegistry) as Array<{ type: ComponentType; label: string; icon: string }>).map((ct) => {
          const IconComp = iconMap[ct.icon];
          return (
            <div
              key={ct.type}
              draggable
              onDragStart={(e) => handleDragStart(e, ct.type)}
              className="flex items-center gap-2 p-2 rounded border border-dark-border cursor-grab hover:border-accent/40 hover:bg-dark-border/20 text-status-offline hover:text-white transition-colors text-sm"
            >
              {IconComp && <IconComp size={14} />}
              <span>{ct.label}</span>
            </div>
          );
        })}
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-3 border-b border-dark-border bg-dark-card px-4 h-10">
          <select
            value={panelId}
            onChange={(e) => setPanelId(e.target.value)}
            className="h-7 px-2 rounded border border-dark-border bg-dark-bg text-xs text-white focus:outline-none focus:border-accent"
          >
            {panels.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span className="font-mono text-xs text-white">
            {currentPanel?.name || '未选择面板'}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleNewPanel}
            className="flex items-center gap-1 h-7 px-3 rounded border border-dark-border text-xs text-status-offline hover:text-accent hover:border-accent"
          >
            <Plus size={12} /> 新建
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1 h-7 px-3 rounded bg-accent text-dark-bg text-xs font-medium hover:bg-accent/90"
          >
            <Save size={12} /> 保存
          </button>
        </div>

        <div
          ref={canvasRef}
          className="flex-1 overflow-auto relative"
          style={{
            backgroundImage: 'radial-gradient(circle, #30363d 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
          onDrop={handleCanvasDrop}
          onDragOver={handleCanvasDragOver}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
        >
          {currentPanel?.components.map((comp) => {
            const def = componentRegistry[comp.type];
            const IconComp = iconMap[def.icon];
            return (
              <div
                key={comp.id}
                className={`absolute rounded border bg-dark-card cursor-move select-none ${
                  selectedId === comp.id
                    ? 'border-accent shadow-[0_0_8px_rgba(0,210,255,0.3)]'
                    : 'border-dark-border'
                }`}
                style={{
                  left: comp.x,
                  top: comp.y,
                  width: comp.width,
                  height: comp.height,
                }}
                onMouseDown={(e) => handleCompMouseDown(e, comp.id)}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-center h-full text-xs text-status-offline">
                  {IconComp && <IconComp size={24} className="text-accent" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-64 border-l border-dark-border bg-dark-card p-4 overflow-auto">
        {selectedComponent ? (
          <div className="space-y-4">
            <div className="text-xs font-mono text-status-offline">属性配置</div>
            <div>
              <label className="block text-xs text-status-offline mb-1">类型</label>
              <div className="text-sm text-white">{componentRegistry[selectedComponent.type].label}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-status-offline mb-1">X</label>
                <input
                  type="number"
                  value={selectedComponent.x}
                  onChange={(e) => {
                    const updated = currentPanel!.components.map((c) =>
                      c.id === selectedComponent.id ? { ...c, x: Number(e.target.value) } : c
                    );
                    updatePanel(currentPanel!.id, { components: updated });
                  }}
                  className="w-full h-7 px-2 rounded border border-dark-border bg-dark-bg text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-status-offline mb-1">Y</label>
                <input
                  type="number"
                  value={selectedComponent.y}
                  onChange={(e) => {
                    const updated = currentPanel!.components.map((c) =>
                      c.id === selectedComponent.id ? { ...c, y: Number(e.target.value) } : c
                    );
                    updatePanel(currentPanel!.id, { components: updated });
                  }}
                  className="w-full h-7 px-2 rounded border border-dark-border bg-dark-bg text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-status-offline mb-1">宽度</label>
                <input
                  type="number"
                  value={selectedComponent.width}
                  onChange={(e) => {
                    const updated = currentPanel!.components.map((c) =>
                      c.id === selectedComponent.id ? { ...c, width: Number(e.target.value) } : c
                    );
                    updatePanel(currentPanel!.id, { components: updated });
                  }}
                  className="w-full h-7 px-2 rounded border border-dark-border bg-dark-bg text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-status-offline mb-1">高度</label>
                <input
                  type="number"
                  value={selectedComponent.height}
                  onChange={(e) => {
                    const updated = currentPanel!.components.map((c) =>
                      c.id === selectedComponent.id ? { ...c, height: Number(e.target.value) } : c
                    );
                    updatePanel(currentPanel!.id, { components: updated });
                  }}
                  className="w-full h-7 px-2 rounded border border-dark-border bg-dark-bg text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="border-t border-dark-border pt-3">
              <div className="text-xs font-mono text-status-offline mb-2">组件属性</div>
              {componentRegistry[selectedComponent.type].propSchema.map((schema) => (
                <div key={schema.key} className="mb-2">
                  <label className="block text-xs text-status-offline mb-1">{schema.label}</label>
                  {renderPropInput(schema)}
                </div>
              ))}
            </div>

            {componentRegistry[selectedComponent.type].maxBindings !== 0 && (
              <div className="border-t border-dark-border pt-3">
                <div className="text-xs font-mono text-status-offline mb-2">数据绑定</div>
                {renderPropInput({ key: 'sensorBindings', label: '', type: 'sensor_binding', defaultValue: null })}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-status-offline text-center py-8">
            选中组件查看属性
          </div>
        )}
      </div>
    </div>
  );
}
