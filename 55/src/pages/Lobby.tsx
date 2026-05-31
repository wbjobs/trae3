import { useState, useEffect } from "react";
import { Plus, RefreshCw, Swords, Map, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { GameListItem, Scenario } from "../../shared/types";
import { useGameStore } from "../stores/gameStore";
import GameCard from "../components/GameCard";

export default function Lobby() {
  const navigate = useNavigate();
  const { gameList, setGameList, scenarios, setScenarios } = useGameStore();
  const [showModal, setShowModal] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState("");
  const [maxTurns, setMaxTurns] = useState(20);
  const [playerName, setPlayerName] = useState("指挥官");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchGames = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/games");
      const data = await res.json();
      if (data.success) {
        setGameList(data.games);
      }
    } catch (e) {
      console.error("Failed to fetch games:", e);
    }
    setLoading(false);
  };

  const fetchScenarios = async () => {
    try {
      const res = await fetch("/api/scenarios");
      const data = await res.json();
      if (data.success) {
        setScenarios(data.scenarios);
        if (data.scenarios.length > 0) {
          setSelectedScenario(data.scenarios[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to fetch scenarios:", e);
    }
  };

  useEffect(() => {
    fetchGames();
    fetchScenarios();
  }, []);

  const handleCreate = async () => {
    if (!selectedScenario) return;
    setCreating(true);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: selectedScenario,
          maxTurns,
          playerName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        await fetchGames();
      }
    } catch (e) {
      console.error("Failed to create game:", e);
    }
    setCreating(false);
  };

  const waitingGames = (gameList || []).filter((g) => g.status === "waiting");
  const playingGames = (gameList || []).filter((g) => g.status === "playing");
  const finishedGames = (gameList || []).filter((g) => g.status === "finished");

  const Section = ({ title, games, icon }: { title: string; games: GameListItem[]; icon: React.ReactNode }) => (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="font-serif text-sm text-[var(--color-text-secondary)]">{title}</h2>
        <span className="text-xs text-data-gray">({games.length})</span>
      </div>
      {games.length === 0 ? (
        <p className="text-xs text-data-gray py-4 text-center bg-[var(--color-surface)]/30 rounded-military border border-[var(--color-border)]/50">
          暂无对局
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg)]">
      <header className="flex items-center justify-between px-6 py-4 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-military bg-tactical-sand/20 flex items-center justify-center">
            <Swords size={20} className="text-tactical-sand" />
          </div>
          <div>
            <h1 className="font-serif text-xl text-tactical-sand tracking-wide">战棋沙盘推演系统</h1>
            <p className="text-[10px] text-data-gray">WAR SANDBOX SIMULATION SYSTEM</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/scenario")}
            className="flex items-center gap-2 px-3 py-2 text-sm text-data-gray hover:text-tactical-sand transition-colors"
          >
            <Map size={16} />
            剧本库
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-tactical-sand/20 text-tactical-sand rounded-military hover:bg-tactical-sand/30 border border-tactical-sand/30 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            创建对局
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-lg text-[var(--color-text)]">作战指挥大厅</h2>
            <button
              onClick={fetchGames}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-data-gray hover:text-tactical-sand transition-colors"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              刷新
            </button>
          </div>

          <Section title="等待加入" games={waitingGames} icon={<BookOpen size={14} className="text-tactical-sand" />} />
          <Section title="进行中" games={playingGames} icon={<Swords size={14} className="text-comm-green" />} />
          <Section title="已结束" games={finishedGames} icon={<Map size={14} className="text-data-gray" />} />
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-military w-full max-w-md mx-4">
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <h3 className="font-serif text-tactical-sand">创建新对局</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs text-data-gray mb-1">指挥官代号</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-military px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-tactical-sand/50"
                  placeholder="输入代号"
                />
              </div>
              <div>
                <label className="block text-xs text-data-gray mb-1">选择剧本</label>
                <select
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-military px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-tactical-sand/50"
                >
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-data-gray mb-1">最大回合数: {maxTurns}</label>
                <input
                  type="range"
                  min={10}
                  max={50}
                  step={5}
                  value={maxTurns}
                  onChange={(e) => setMaxTurns(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[var(--color-border)] flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-data-gray hover:text-[var(--color-text)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !selectedScenario}
                className="px-4 py-2 bg-tactical-sand/20 text-tactical-sand rounded-military hover:bg-tactical-sand/30 border border-tactical-sand/30 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {creating ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
