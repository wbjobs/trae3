import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward, FastForward, Rewind, Bookmark, Plus } from "lucide-react";
import { useGameStore } from "../stores/gameStore";
import HexMap from "../components/HexMap";
import type { TurnResult, Unit, ReplayBookmark, Phase, MovementAction, BattleResult, GameEvent } from "../../shared/types";

interface TimelineEvent {
  turn: number;
  phase: Phase;
  type: "move" | "battle" | "event";
  label: string;
  data: MovementAction | BattleResult | GameEvent;
}

export default function Replay() {
  const { id } = useParams<{ id: string }>();
  const { currentGame, setCurrentGame, replayData, setReplayData } = useGameStore();
  const [playing, setPlaying] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [gameUnits, setGameUnits] = useState<Unit[]>([]);
  const [bookmarks, setBookmarks] = useState<ReplayBookmark[]>([]);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [bookmarkDesc, setBookmarkDesc] = useState("");
  const [selectedTab, setSelectedTab] = useState<"events" | "bookmarks">("events");

  useEffect(() => {
    if (id) {
      fetchGame(id);
      fetchReplay(id);
    }
    return () => {
      setCurrentGame(null);
      setReplayData([]);
    };
  }, [id]);

  const fetchGame = async (gameId: string) => {
    try {
      const res = await fetch(`/api/games/${gameId}`);
      const data = await res.json();
      if (data.success) {
        setCurrentGame(data.game);
        setGameUnits([...data.game.units]);
      }
    } catch (e) {
      console.error("Failed to fetch game:", e);
    }
  };

  const fetchReplay = async (gameId: string) => {
    try {
      const res = await fetch(`/api/replay/${gameId}`);
      const data = await res.json();
      if (data.success) {
        setReplayData(data.turns);
      }
    } catch (e) {
      console.error("Failed to fetch replay:", e);
    }
  };

  useEffect(() => {
    if (!playing || replayData.length === 0) return;
    const interval = setInterval(() => {
      setCurrentTurn((prev) => {
        if (prev >= replayData.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 2000 / speed);
    return () => clearInterval(interval);
  }, [playing, speed, replayData.length]);

  const applyTurn = (turnIndex: number) => {
    if (!currentGame || !replayData[turnIndex]) return;
    const turn = replayData[turnIndex];
    const updatedUnits = [...gameUnits];

    for (const movement of turn.movements) {
      const unit = updatedUnits.find((u) => u.id === movement.unitId);
      if (unit) {
        unit.position = movement.to;
      }
    }

    for (const battle of turn.battles) {
      const attacker = updatedUnits.find((u) => u.id === battle.attackerId);
      const defender = updatedUnits.find((u) => u.id === battle.defenderId);
      if (attacker) attacker.hp = battle.attackerHp;
      if (defender) {
        defender.hp = battle.defenderHp;
        if (battle.defenderDestroyed) {
          defender.status = "destroyed";
        }
      }
    }

    setGameUnits(updatedUnits);
  };

  useEffect(() => {
    if (currentTurn >= 0 && currentTurn < replayData.length) {
      applyTurn(currentTurn);
    }
  }, [currentTurn]);

  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];
    replayData.forEach((turn, turnIdx) => {
      turn.movements.forEach((m) => {
        events.push({
          turn: turnIdx,
          phase: turn.phase,
          type: "move",
          label: `${m.unitId.slice(0, 6)} 移动至 (${m.to.q}, ${m.to.r})`,
          data: m,
        });
      });
      turn.battles.forEach((b) => {
        events.push({
          turn: turnIdx,
          phase: turn.phase,
          type: "battle",
          label: `${b.attackerId.slice(0, 6)} → ${b.defenderId.slice(0, 6)}`,
          data: b,
        });
      });
      turn.events.forEach((e) => {
        events.push({
          turn: turnIdx,
          phase: turn.phase,
          type: "event",
          label: e.description,
          data: e,
        });
      });
    });
    return events;
  }, [replayData]);

  const handleJump = (turn: number) => {
    if (!currentGame) return;
    setGameUnits([...currentGame.units]);
    setCurrentTurn(turn);
    for (let i = 0; i < turn; i++) {
      if (replayData[i]) {
        applyTurn(i);
      }
    }
  };

  const addBookmark = () => {
    if (!bookmarkLabel.trim()) return;
    const turnData = replayData[currentTurn];
    if (!turnData) return;
    const newBookmark: ReplayBookmark = {
      turn: currentTurn,
      phase: turnData.phase,
      label: bookmarkLabel,
      description: bookmarkDesc,
    };
    setBookmarks([...bookmarks, newBookmark]);
    setShowBookmarkModal(false);
    setBookmarkLabel("");
    setBookmarkDesc("");
  };

  const jumpToBookmark = (bookmark: ReplayBookmark) => {
    handleJump(bookmark.turn);
  };

  const currentTurnData: TurnResult | undefined = replayData[currentTurn];

  if (!currentGame) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-bg)] text-data-gray">
        正在加载战报...
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
          <h2 className="font-serif text-sm text-tactical-sand">战报复盘 - {currentGame.scenarioName}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-data-gray">回合 {currentTurn + 1}/{replayData.length}</span>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1">
          <HexMap
            tiles={currentGame.tiles}
            units={gameUnits}
            selectedUnit={null}
            movableRange={[]}
            attackableRange={[]}
            mapWidth={currentGame.mapWidth}
            mapHeight={currentGame.mapHeight}
          />
        </div>

        <div className="w-72 bg-[var(--color-bg-secondary)] border-l border-[var(--color-border)] flex flex-col">
          <div className="flex border-b border-[var(--color-border)]">
            <button
              onClick={() => setSelectedTab("events")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                selectedTab === "events"
                  ? "text-tactical-sand border-b-2 border-tactical-sand"
                  : "text-data-gray hover:text-tactical-sand"
              }`}
            >
              事件
            </button>
            <button
              onClick={() => setSelectedTab("bookmarks")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                selectedTab === "bookmarks"
                  ? "text-tactical-sand border-b-2 border-tactical-sand"
                  : "text-data-gray hover:text-tactical-sand"
              }`}
            >
              书签
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {selectedTab === "events" ? (
              <div className="p-3">
                {currentTurnData && (
                  <div className="space-y-3">
                    {currentTurnData.movements.length > 0 && (
                      <div>
                        <p className="text-[10px] text-data-gray mb-1">部队机动</p>
                        {currentTurnData.movements.map((m, i) => (
                          <div key={i} className="text-xs text-[var(--color-text-secondary)] py-1 px-2 bg-[var(--color-surface)]/30 rounded-military mb-1">
                            {m.unitId.slice(0, 6)} 移动至 ({m.to.q}, {m.to.r})
                          </div>
                        ))}
                      </div>
                    )}
                    {currentTurnData.battles.length > 0 && (
                      <div>
                        <p className="text-[10px] text-alert-red mb-1">战斗</p>
                        {currentTurnData.battles.map((b, i) => (
                          <div key={i} className="text-xs text-[var(--color-text-secondary)] py-1 px-2 bg-alert-red/10 rounded-military mb-1 border border-alert-red/20">
                            <p>攻击: {b.attackerId.slice(0, 6)} → {b.defenderId.slice(0, 6)}</p>
                            <p className="text-alert-red">伤害: {b.damageDealt}</p>
                            {b.defenderDestroyed && <p className="text-alert-red font-bold">单位被摧毁!</p>}
                          </div>
                        ))}
                      </div>
                    )}
                    {currentTurnData.events.length > 0 && (
                      <div>
                        <p className="text-[10px] text-tactical-sand mb-1">战情事件</p>
                        {currentTurnData.events.map((e, i) => (
                          <div key={i} className="text-xs text-[var(--color-text-secondary)] py-1 px-2 bg-tactical-sand/10 rounded-military mb-1 border border-tactical-sand/20">
                            {e.description}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3">
                {bookmarks.length === 0 ? (
                  <div className="text-xs text-data-gray text-center py-4">暂无书签</div>
                ) : (
                  <div className="space-y-2">
                    {bookmarks.map((b, i) => (
                      <button
                        key={i}
                        onClick={() => jumpToBookmark(b)}
                        className="w-full text-left p-2 bg-[var(--color-bg)]/50 rounded-military hover:bg-[var(--color-bg)] transition-colors"
                      >
                        <div className="text-xs text-tactical-sand">{b.label}</div>
                        <div className="text-[10px] text-data-gray mt-0.5">
                          回合 {b.turn + 1} · {b.phase}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedTab === "bookmarks" && (
            <div className="p-3 border-t border-[var(--color-border)]">
              <button
                onClick={() => setShowBookmarkModal(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-tactical-sand/20 text-tactical-sand rounded-military hover:bg-tactical-sand/30 transition-colors text-xs"
              >
                <Plus size={12} /> 添加书签
              </button>
            </div>
          )}
        </div>

        {showBookmarkModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-military p-4 w-80">
              <h3 className="text-sm text-tactical-sand font-serif mb-3">添加书签</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-data-gray mb-1">标签</label>
                  <input
                    type="text"
                    value={bookmarkLabel}
                    onChange={(e) => setBookmarkLabel(e.target.value)}
                    placeholder="书签名称..."
                    className="w-full px-2 py-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-military text-xs text-[var(--color-text)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-data-gray mb-1">描述 (可选)</label>
                  <textarea
                    value={bookmarkDesc}
                    onChange={(e) => setBookmarkDesc(e.target.value)}
                    placeholder="描述..."
                    rows={2}
                    className="w-full px-2 py-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-military text-xs text-[var(--color-text)] resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowBookmarkModal(false)}
                    className="flex-1 px-3 py-1.5 border border-[var(--color-border)] text-data-gray rounded-military hover:bg-[var(--color-bg)] transition-colors text-xs"
                  >
                    取消
                  </button>
                  <button
                    onClick={addBookmark}
                    className="flex-1 px-3 py-1.5 bg-tactical-sand/20 text-tactical-sand rounded-military hover:bg-tactical-sand/30 transition-colors text-xs"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border)]">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => handleJump(0)}
            className="p-1.5 text-data-gray hover:text-tactical-sand transition-colors"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={() => setCurrentTurn(Math.max(0, currentTurn - 1))}
            className="p-1.5 text-data-gray hover:text-tactical-sand transition-colors"
          >
            <Rewind size={16} />
          </button>
          <button
            onClick={() => setPlaying(!playing)}
            className="p-2 bg-tactical-sand/20 text-tactical-sand rounded-full hover:bg-tactical-sand/30 transition-colors"
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            onClick={() => setCurrentTurn(Math.min(replayData.length - 1, currentTurn + 1))}
            className="p-1.5 text-data-gray hover:text-tactical-sand transition-colors"
          >
            <FastForward size={16} />
          </button>
          <button
            onClick={() => handleJump(replayData.length - 1)}
            className="p-1.5 text-data-gray hover:text-tactical-sand transition-colors"
          >
            <SkipForward size={16} />
          </button>

          <div className="flex items-center gap-2 ml-4">
            <span className="text-[10px] text-data-gray">速度:</span>
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-0.5 text-[10px] rounded-military transition-colors ${
                  speed === s
                    ? "bg-tactical-sand/20 text-tactical-sand border border-tactical-sand/30"
                    : "text-data-gray hover:text-tactical-sand"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={replayData.length - 1}
            value={currentTurn}
            onChange={(e) => handleJump(Number(e.target.value))}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}
