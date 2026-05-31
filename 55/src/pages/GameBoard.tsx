import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Camera, Clock, Play, Pause } from "lucide-react";
import { useGameStore } from "../stores/gameStore";
import { useSocket } from "../hooks/useSocket";
import HexMap from "../components/HexMap";
import UnitPanel from "../components/UnitPanel";
import StatusBar from "../components/StatusBar";
import ChatWindow from "../components/ChatWindow";
import type { HexCoord, MovementAction, BattleResult, GameSnapshot } from "../../shared/types";

type ActionMode = "none" | "move" | "attack";

export default function GameBoard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentGame, currentPlayer, selectedUnit, setSelectedUnit, movableRange, setMovableRange, setAttackableRange, attackableRange, setCurrentPlayer } = useGameStore();
  const [actionMode, setActionMode] = useState<ActionMode>("none");
  const [playerName] = useState(`玩家${Math.floor(Math.random() * 1000)}`);
  const [recentMovements, setRecentMovements] = useState<MovementAction[]>([]);
  const [recentBattles, setRecentBattles] = useState<BattleResult[]>([]);
  const [snapshots, setSnapshots] = useState<GameSnapshot[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);

  const { sendCommand, sendChat, readyGame, joinGame, leaveGame, on, off } = useSocket();

  const fetchSnapshots = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/games/${id}/snapshots`);
      const data = await res.json();
      if (data.success) {
        setSnapshots(data.snapshots);
      }
    } catch (e) {
      console.error("Failed to fetch snapshots", e);
    }
  }, [id]);

  const saveSnapshot = useCallback(async (name?: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/games/${id}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || `回合 ${currentGame?.currentTurn}` }),
      });
      const data = await res.json();
      if (data.success) {
        fetchSnapshots();
      }
    } catch (e) {
      console.error("Failed to save snapshot", e);
    }
  }, [id, currentGame, fetchSnapshots]);

  const restoreSnapshot = useCallback(async (snapshotId: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/games/${id}/snapshots/${snapshotId}/restore`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        const state = data.state;
        if (state) {
          useGameStore.getState().setCurrentGame(state);
        }
      }
    } catch (e) {
      console.error("Failed to restore snapshot", e);
    }
  }, [id]);

  useEffect(() => {
    const handleTurnResult = (result: any) => {
      if (result.movements?.length > 0) {
        setRecentMovements(result.movements);
        setTimeout(() => setRecentMovements([]), 500);
      }
      if (result.battles?.length > 0) {
        setRecentBattles(result.battles);
        setTimeout(() => setRecentBattles([]), 500);
      }
    };

    on("game:turnResult", handleTurnResult);
    return () => off("game:turnResult", handleTurnResult);
  }, [on, off]);

  useEffect(() => {
    if (id) {
      joinGame(id);
      fetchSnapshots();
    }
    return () => {
      if (id) {
        leaveGame(id);
      }
      setSelectedUnit(null);
      setMovableRange([]);
      setAttackableRange([]);
    };
  }, [id, fetchSnapshots]);

  useEffect(() => {
    if (currentGame && !currentPlayer) {
      const player = currentGame.players.find(p => p.name === playerName);
      if (player) {
        setCurrentPlayer(player);
      }
    }
  }, [currentGame, playerName]);

  const handleUnitClick = (unitId: string) => {
    const unit = currentGame?.units.find(u => u.id === unitId);
    if (!unit) return;
    setSelectedUnit(unit);
    setActionMode("none");
    setMovableRange([]);
    setAttackableRange([]);
  };

  const handleHexClick = (q: number, r: number) => {
    if (!selectedUnit) return;
    const target = { q, r };

    if (actionMode === "move") {
      const inRange = movableRange.some(h => h.q === q && h.r === r);
      if (inRange) {
        sendCommand({
          type: "move",
          unitId: selectedUnit.id,
          target,
        });
        setActionMode("none");
        setMovableRange([]);
      }
    } else if (actionMode === "attack") {
      const targetUnit = currentGame?.units.find(
        u => u.position.q === q && u.position.r === r && u.status !== "destroyed" && u.faction !== selectedUnit.faction
      );
      if (targetUnit) {
        sendCommand({
          type: "attack",
          unitId: selectedUnit.id,
          targetUnitId: targetUnit.id,
          target,
        });
        setActionMode("none");
        setAttackableRange([]);
      }
    }
  };

  const calculateMoveRange = (): HexCoord[] => {
    if (!selectedUnit || !currentGame) return [];
    const range: HexCoord[] = [];
    const visited = new Set<string>();
    const queue: { hex: HexCoord; cost: number }[] = [{ hex: selectedUnit.position, cost: 0 }];
    const directions = [
      { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
      { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
    ];

    while (queue.length > 0) {
      const { hex, cost } = queue.shift()!;
      const key = `${hex.q},${hex.r}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (cost > 0) {
        const occupied = currentGame.units.some(
          u => u.position.q === hex.q && u.position.r === hex.r && u.status !== "destroyed"
        );
        if (!occupied) {
          range.push(hex);
        }
      }

      for (const dir of directions) {
        const next = { q: hex.q + dir.q, r: hex.r + dir.r };
        const nextKey = `${next.q},${next.r}`;
        if (visited.has(nextKey)) continue;

        const tile = currentGame.tiles.find(t => t.q === next.q && t.r === next.r);
        if (!tile) continue;

        const moveCost = {
          plain: 1, forest: 2, mountain: 3, water: 99, urban: 1, road: 0.5,
        }[tile.terrain] || 1;

        const newCost = cost + moveCost;
        if (newCost <= selectedUnit.movement) {
          queue.push({ hex: next, cost: newCost });
        }
      }
    }

    return range;
  };

  const hexDistance = (a: HexCoord, b: HexCoord): number => {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  };

  const calculateAttackRange = (): HexCoord[] => {
    if (!selectedUnit || !currentGame) return [];
    const range: HexCoord[] = [];
    const attackRange = selectedUnit.type === "artillery" ? 3 : 1;

    for (const tile of currentGame.tiles) {
      const dist = hexDistance(selectedUnit.position, tile);
      if (dist > 0 && dist <= attackRange) {
        const enemy = currentGame.units.find(
          u => u.position.q === tile.q && u.position.r === tile.r && u.status !== "destroyed" && u.faction !== selectedUnit.faction
        );
        if (enemy) {
          range.push({ q: tile.q, r: tile.r });
        }
      }
    }

    return range;
  };

  const handleMove = () => {
    if (!selectedUnit?.moved) {
      setActionMode("move");
      setMovableRange(calculateMoveRange());
      setAttackableRange([]);
    }
  };

  const handleAttack = () => {
    if (!selectedUnit?.attacked) {
      setActionMode("attack");
      setAttackableRange(calculateAttackRange());
      setMovableRange([]);
    }
  };

  const handleWait = () => {
    if (selectedUnit) {
      sendCommand({
        type: "wait",
        unitId: selectedUnit.id,
      });
      setSelectedUnit(null);
      setActionMode("none");
      setMovableRange([]);
      setAttackableRange([]);
    }
  };

  if (!currentGame || !id) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-bg)] text-data-gray">
        正在加载对局...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg)]">
      <StatusBar game={currentGame} currentPlayer={currentPlayer} />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative scan-overlay">
          <Link
            to="/"
            className="absolute top-4 left-4 z-10 flex items-center gap-1.5 px-2 py-1 bg-[var(--color-bg-secondary)]/80 backdrop-blur border border-[var(--color-border)] rounded-military text-xs text-data-gray hover:text-tactical-sand transition-colors"
          >
            <ArrowLeft size={12} /> 返回大厅
          </Link>

          {actionMode !== "none" && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 bg-[var(--color-bg-secondary)]/80 backdrop-blur border border-[var(--color-border)] rounded-military text-xs text-tactical-sand">
              {actionMode === "move" ? "点击目标格子移动" : "点击敌方单位攻击"}
            </div>
          )}

          {currentGame.status === "waiting" && currentPlayer && !currentPlayer.isReady && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 bg-[var(--color-bg-secondary)]/90 backdrop-blur border border-[var(--color-border)] rounded-military">
              <span className="text-sm text-data-gray">等待对手加入...</span>
              <button
                onClick={() => readyGame(id)}
                className="px-3 py-1.5 bg-comm-green/20 text-comm-green rounded-military hover:bg-comm-green/30 border border-comm-green/30 transition-colors text-xs font-medium"
              >
                准备就绪
              </button>
            </div>
          )}

          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <button
              onClick={() => saveSnapshot()}
              className="flex items-center gap-1.5 px-2 py-1 bg-[var(--color-bg-secondary)]/80 backdrop-blur border border-[var(--color-border)] rounded-military text-xs text-data-gray hover:text-tactical-sand transition-colors"
              title="保存快照"
            >
              <Camera size={14} /> 快照
            </button>
            <button
              onClick={() => setShowSnapshots(!showSnapshots)}
              className="flex items-center gap-1.5 px-2 py-1 bg-[var(--color-bg-secondary)]/80 backdrop-blur border border-[var(--color-border)] rounded-military text-xs text-data-gray hover:text-tactical-sand transition-colors"
              title="历史快照"
            >
              <Clock size={14} /> 历史
            </button>
          </div>

          {showSnapshots && (
            <div className="absolute top-12 right-4 z-20 w-64 bg-[var(--color-bg-secondary)]/95 backdrop-blur border border-[var(--color-border)] rounded-military shadow-lg max-h-80 overflow-y-auto">
              <div className="px-3 py-2 border-b border-[var(--color-border)] text-xs text-tactical-sand font-medium">
                战情快照
              </div>
              {snapshots.length === 0 ? (
                <div className="px-3 py-4 text-xs text-data-gray text-center">暂无快照</div>
              ) : (
                <div className="py-1">
                  {snapshots.map((snap) => (
                    <button
                      key={snap.id}
                      onClick={() => restoreSnapshot(snap.id)}
                      className="w-full px-3 py-2 text-left hover:bg-[var(--color-bg)] text-xs transition-colors"
                    >
                      <div className="text-tactical-sand">{snap.name}</div>
                      <div className="text-data-gray mt-0.5">
                        回合 {snap.turn} · {new Date(snap.createdAt).toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <HexMap
            tiles={currentGame.tiles}
            units={currentGame.units}
            selectedUnit={selectedUnit}
            movableRange={actionMode === "move" ? movableRange : []}
            attackableRange={actionMode === "attack" ? attackableRange : []}
            mapWidth={currentGame.mapWidth}
            mapHeight={currentGame.mapHeight}
            onHexClick={handleHexClick}
            onUnitClick={handleUnitClick}
            movements={recentMovements}
            battles={recentBattles}
          />
        </div>

        <div className="w-72 bg-[var(--color-bg-secondary)] border-l border-[var(--color-border)]">
          <UnitPanel
            onMove={handleMove}
            onAttack={handleAttack}
            onWait={handleWait}
            currentPhase={currentGame.phase}
          />
        </div>
      </div>

      <ChatWindow gameId={id} onSend={sendChat} />
    </div>
  );
}
