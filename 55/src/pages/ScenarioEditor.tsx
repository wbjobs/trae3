import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Save, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useGameStore } from "../stores/gameStore";
import HexMap from "../components/HexMap";
import type { Scenario, UnitType, TerrainType } from "../../shared/types";
import { UNIT_STATS, TERRAIN_COLORS } from "../../shared/types";

const TERRAIN_OPTIONS: TerrainType[] = ["plain", "forest", "mountain", "water", "urban", "road"];
const TERRAIN_LABELS: Record<TerrainType, string> = {
  plain: "平原", forest: "森林", mountain: "山地", water: "水域", urban: "城镇", road: "道路"
};

export default function ScenarioEditor() {
  const { scenarios, setScenarios } = useGameStore();
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [selectedTerrain, setSelectedTerrain] = useState<TerrainType>("plain");
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "", mapWidth: 10, mapHeight: 8 });
  const [tiles, setTiles] = useState<{ q: number; r: number; terrain: TerrainType }[]>([]);
  const [units, setUnits] = useState<{ type: UnitType; faction: string; q: number; r: number }[]>([]);
  const [showUnitEditor, setShowUnitEditor] = useState(false);
  const [selectedFaction, setSelectedFaction] = useState("红方");
  const [selectedUnitType, setSelectedUnitType] = useState<UnitType>("infantry");

  useEffect(() => {
    fetchScenarios();
  }, []);

  const fetchScenarios = async () => {
    try {
      const res = await fetch("/api/scenarios");
      const data = await res.json();
      if (data.success) {
        setScenarios(data.scenarios);
      }
    } catch (e) {
      console.error("Failed to fetch scenarios:", e);
    }
  };

  const handleNew = () => {
    setEditing(true);
    setSelectedScenario(null);
    setFormData({ name: "新剧本", description: "", mapWidth: 10, mapHeight: 8 });
    generateEmptyTiles(10, 8);
    setUnits([]);
  };

  const handleEdit = (s: Scenario) => {
    setEditing(true);
    setSelectedScenario(s);
    setFormData({
      name: s.name,
      description: s.description,
      mapWidth: s.mapWidth,
      mapHeight: s.mapHeight,
    });
    setTiles(s.tiles.map((t) => ({ q: t.q, r: t.r, terrain: t.terrain as TerrainType })));
    setUnits(s.units.map((u) => ({ type: u.type, faction: u.faction, q: u.q, r: u.r })));
  };

  const generateEmptyTiles = (width: number, height: number) => {
    const newTiles: { q: number; r: number; terrain: TerrainType }[] = [];
    for (let r = 0; r < height; r++) {
      for (let q = 0; q < width; q++) {
        newTiles.push({ q, r, terrain: "plain" });
      }
    }
    setTiles(newTiles);
  };

  const handleMapSizeChange = (w: number, h: number) => {
    setFormData({ ...formData, mapWidth: w, mapHeight: h });
    generateEmptyTiles(w, h);
  };

  const handleTileClick = (q: number, r: number) => {
    if (!editing) return;
    setTiles((prev) => {
      const idx = prev.findIndex((t) => t.q === q && t.r === r);
      if (idx !== -1) {
        const newTiles = [...prev];
        newTiles[idx] = { ...newTiles[idx], terrain: selectedTerrain };
        return newTiles;
      }
      return prev;
    });
  };

  const handleAddUnit = (q: number, r: number) => {
    if (!editing) return;
    const existing = units.findIndex((u) => u.q === q && u.r === r);
    if (existing !== -1) {
      setUnits((prev) => prev.filter((_, i) => i !== existing));
    } else {
      setUnits((prev) => [...prev, { type: selectedUnitType, faction: selectedFaction, q, r }]);
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch("/api/scenarios", {
        method: selectedScenario ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedScenario?.id,
          ...formData,
          tiles,
          units,
          factions: ["红方", "蓝方"],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditing(false);
        setSelectedScenario(null);
        fetchScenarios();
      }
    } catch (e) {
      console.error("Failed to save scenario:", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此剧本？")) return;
    try {
      await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
      fetchScenarios();
    } catch (e) {
      console.error("Failed to delete scenario:", e);
    }
  };

  if (editing) {
    return (
      <div className="h-full flex flex-col bg-[var(--color-bg)]">
        <header className="flex items-center justify-between px-4 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1.5 text-xs text-data-gray hover:text-tactical-sand transition-colors"
            >
              <ArrowLeft size={14} /> 返回
            </button>
            <div className="h-4 w-px bg-[var(--color-border)]" />
            <h2 className="font-serif text-sm text-tactical-sand">
              {selectedScenario ? "编辑剧本" : "新建剧本"}
            </h2>
          </div>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-tactical-sand/20 text-tactical-sand rounded-military hover:bg-tactical-sand/30 border border-tactical-sand/30 transition-colors text-xs"
          >
            <Save size={12} /> 保存
          </button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1">
            <HexMap
              tiles={tiles}
              units={units.map((u, i) => ({
                id: `unit-${i}`,
                type: u.type,
                faction: u.faction,
                hp: UNIT_STATS[u.type].hp,
                maxHp: UNIT_STATS[u.type].hp,
                attack: UNIT_STATS[u.type].attack,
                defense: UNIT_STATS[u.type].defense,
                movement: UNIT_STATS[u.type].movement,
                position: { q: u.q, r: u.r },
                status: "active",
                moved: false,
                attacked: false,
              }))}
              selectedUnit={null}
              movableRange={[]}
              attackableRange={[]}
              mapWidth={formData.mapWidth}
              mapHeight={formData.mapHeight}
              onHexClick={showUnitEditor ? handleAddUnit : handleTileClick}
              editable
            />
          </div>

          <div className="w-72 bg-[var(--color-bg-secondary)] border-l border-[var(--color-border)] overflow-y-auto">
            <div className="p-3 space-y-4">
              <div>
                <label className="block text-xs text-data-gray mb-1">剧本名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-military px-2 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-tactical-sand/50"
                />
              </div>

              <div>
                <label className="block text-xs text-data-gray mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-military px-2 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-tactical-sand/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-data-gray mb-1">宽度</label>
                  <input
                    type="number"
                    min={5}
                    max={20}
                    value={formData.mapWidth}
                    onChange={(e) => handleMapSizeChange(Number(e.target.value), formData.mapHeight)}
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-military px-2 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-tactical-sand/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-data-gray mb-1">高度</label>
                  <input
                    type="number"
                    min={5}
                    max={20}
                    value={formData.mapHeight}
                    onChange={(e) => handleMapSizeChange(formData.mapWidth, Number(e.target.value))}
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-military px-2 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-tactical-sand/50"
                  />
                </div>
              </div>

              <div className="border-t border-[var(--color-border)] pt-3">
                <p className="text-xs text-data-gray mb-2">地形笔刷</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {TERRAIN_OPTIONS.map((t) => (
                    <button
                      key={t}
                      onClick={() => { setSelectedTerrain(t); setShowUnitEditor(false); }}
                      className={`py-1.5 px-2 rounded-military text-[10px] flex items-center gap-1 transition-colors ${
                        selectedTerrain === t && !showUnitEditor
                          ? "bg-tactical-sand/20 text-tactical-sand border border-tactical-sand/30"
                          : "bg-[var(--color-surface)] text-data-gray hover:text-[var(--color-text)]"
                      }`}
                    >
                      <span className="w-3 h-3 rounded" style={{ backgroundColor: TERRAIN_COLORS[t] }} />
                      {TERRAIN_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-[var(--color-border)] pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-data-gray">放置单位</p>
                  <button
                    onClick={() => setShowUnitEditor(!showUnitEditor)}
                    className={`p-1 rounded-military transition-colors ${
                      showUnitEditor ? "bg-tactical-sand/20 text-tactical-sand" : "text-data-gray"
                    }`}
                  >
                    <Settings size={12} />
                  </button>
                </div>
                {showUnitEditor && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] text-data-gray mb-1">阵营</label>
                      <select
                        value={selectedFaction}
                        onChange={(e) => setSelectedFaction(e.target.value)}
                        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-military px-2 py-1 text-xs text-[var(--color-text)]"
                      >
                        <option value="红方">红方</option>
                        <option value="蓝方">蓝方</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-data-gray mb-1">单位类型</label>
                      <div className="grid grid-cols-3 gap-1">
                        {(Object.keys(UNIT_STATS) as UnitType[]).map((ut) => (
                          <button
                            key={ut}
                            onClick={() => setSelectedUnitType(ut)}
                            className={`py-1 rounded-military text-xs ${
                              selectedUnitType === ut
                                ? "bg-tactical-sand/20 text-tactical-sand border border-tactical-sand/30"
                                : "bg-[var(--color-surface)] text-data-gray"
                            }`}
                          >
                            {UNIT_STATS[ut].icon}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-data-gray">点击地图放置/移除单位</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg)]">
      <header className="flex items-center justify-between px-4 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs text-data-gray hover:text-tactical-sand transition-colors"
          >
            <ArrowLeft size={14} /> 返回大厅
          </Link>
          <div className="h-4 w-px bg-[var(--color-border)]" />
          <h2 className="font-serif text-sm text-tactical-sand">剧本库</h2>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-tactical-sand/20 text-tactical-sand rounded-military hover:bg-tactical-sand/30 border border-tactical-sand/30 transition-colors text-xs"
        >
          <Plus size={12} /> 新建剧本
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scenarios.map((s) => (
              <div
                key={s.id}
                className="military-border bg-[var(--color-surface)]/60 hover:bg-[var(--color-surface-hover)]/80 transition-all duration-200"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-serif text-tactical-sand text-sm">{s.name}</h3>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="p-1 text-data-gray hover:text-alert-red transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <p className="text-xs text-data-gray mb-2 line-clamp-2">{s.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-data-gray font-mono">
                      {s.mapWidth}×{s.mapHeight}
                    </span>
                    <button
                      onClick={() => handleEdit(s)}
                      className="text-xs text-tactical-sand hover:underline"
                    >
                      编辑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
