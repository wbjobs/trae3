import { useRef, useEffect, useCallback, useMemo } from "react";
import type { HexTile, Unit, HexCoord, TerrainType, MovementAction, BattleResult } from "../../shared/types";
import { TERRAIN_COLORS, UNIT_STATS } from "../../shared/types";

const HEX_SIZE = 28;
const SQRT3 = Math.sqrt(3);
const ANIMATION_DURATION = 300;

interface HexMapProps {
  tiles: HexTile[];
  units: Unit[];
  selectedUnit: Unit | null;
  movableRange: HexCoord[];
  attackableRange: HexCoord[];
  mapWidth: number;
  mapHeight: number;
  onHexClick?: (q: number, r: number) => void;
  onUnitClick?: (unitId: string) => void;
  editable?: boolean;
  selectedTerrain?: TerrainType;
  movements?: MovementAction[];
  battles?: BattleResult[];
}

function hexToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r);
  const y = HEX_SIZE * (1.5 * r);
  return { x, y };
}

function pixelToHex(px: number, py: number): { q: number; r: number } {
  const q = ((SQRT3 / 3) * px - (1 / 3) * py) / HEX_SIZE;
  const r = ((2 / 3) * py) / HEX_SIZE;
  return hexRound(q, r);
}

function hexRound(q: number, r: number): { q: number; r: number } {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fill: string,
  stroke: string
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  unit: Unit,
  isSelected: boolean,
  alpha: number = 1
) {
  const stats = UNIT_STATS[unit.type];
  ctx.globalAlpha = alpha;
  ctx.font = `${HEX_SIZE * 0.9}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(stats.icon, cx, cy - 2);

  const barW = HEX_SIZE * 1.2;
  const barH = 3;
  const barY = cy + HEX_SIZE * 0.5;
  const hpRatio = unit.hp / unit.maxHp;

  ctx.fillStyle = "#333";
  ctx.fillRect(cx - barW / 2, barY, barW, barH);
  ctx.fillStyle = hpRatio > 0.6 ? "#4CAF50" : hpRatio > 0.3 ? "#C4A265" : "#D44B3F";
  ctx.fillRect(cx - barW / 2, barY, barW * hpRatio, barH);

  if (isSelected) {
    ctx.beginPath();
    ctx.arc(cx, cy, HEX_SIZE * 0.8, 0, Math.PI * 2);
    ctx.strokeStyle = "#C4A265";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawBattleEffect(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  progress: number
) {
  const size = HEX_SIZE * (0.5 + progress * 0.5);
  ctx.globalAlpha = 1 - progress;
  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  ctx.strokeStyle = "#FF6B35";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 107, 53, 0.3)";
  ctx.fill();
  ctx.globalAlpha = 1;
}

interface AnimState {
  type: "move" | "battle" | "idle";
  startTime: number;
  unitId: string;
  fromPos?: HexCoord;
  toPos?: HexCoord;
  battlePos?: HexCoord;
}

interface UnitPositions {
  [unitId: string]: HexCoord;
}

export default function HexMap({
  tiles,
  units,
  selectedUnit,
  movableRange,
  attackableRange,
  mapWidth,
  mapHeight,
  onHexClick,
  onUnitClick,
  editable,
  selectedTerrain,
  movements = [],
  battles = [],
}: HexMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const draggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const animRef = useRef<AnimState | null>(null);
  const rafRef = useRef<number>(0);
  const lastViewRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });
  const prevUnitsRef = useRef<UnitPositions>({});
  const dirtyTilesRef = useRef<Set<string>>(new Set());

  const tileHash = useMemo(() => {
    return tiles.map((t) => `${t.q},${t.r}:${t.terrain}`).join("|");
  }, [tiles]);

  const buildBackground = useCallback(() => {
    if (!bgCanvasRef.current) {
      bgCanvasRef.current = document.createElement("canvas");
    }
    const bgCanvas = bgCanvasRef.current;
    bgCanvas.width = mapWidth * HEX_SIZE * SQRT3 + HEX_SIZE * 2;
    bgCanvas.height = mapHeight * HEX_SIZE * 1.5 + HEX_SIZE * 2;
    const bgCtx = bgCanvas.getContext("2d")!;
    bgCtx.fillStyle = "#0A1F1A";
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    const offsetX = HEX_SIZE;
    const offsetY = HEX_SIZE;

    for (const tile of tiles) {
      const { x, y } = hexToPixel(tile.q, tile.r);
      drawHex(
        bgCtx,
        x + offsetX,
        y + offsetY,
        HEX_SIZE - 1,
        TERRAIN_COLORS[tile.terrain],
        "#1A3F35"
      );
    }

    lastViewRef.current = { offsetX: 0, offsetY: 0, scale: 1 };
  }, [tiles, mapWidth, mapHeight]);

  const getInterpolatedPos = useCallback((unit: Unit, t: number): HexCoord => {
    const anim = animRef.current;
    if (anim?.type === "move" && anim.unitId === unit.id) {
      const from = anim.fromPos!;
      const to = anim.toPos!;
      const easeT = 1 - Math.pow(1 - t, 3);
      return {
        q: from.q + (to.q - from.q) * easeT,
        r: from.r + (to.r - from.r) * easeT,
      };
    }
    return unit.position;
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!bgCanvasRef.current) return;

    const w = canvas.width;
    const h = canvas.height;
    const bgCanvas = bgCanvasRef.current;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0A1F1A";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(offsetRef.current.x, offsetRef.current.y);
    ctx.scale(scaleRef.current, scaleRef.current);

    const centerX = w / 2 / scaleRef.current - offsetRef.current.x / scaleRef.current;
    const centerY = h / 2 / scaleRef.current - offsetRef.current.y / scaleRef.current;
    const bgOffset = {
      x: centerX - HEX_SIZE,
      y: centerY - HEX_SIZE,
    };

    ctx.drawImage(bgCanvas, bgOffset.x, bgOffset.y);

    const movableSet = new Set(movableRange.map((h) => `${h.q},${h.r}`));
    const attackableSet = new Set(attackableRange.map((h) => `${h.q},${h.r}`));

    const changedTiles = new Set<string>();
    movableRange.forEach((h) => changedTiles.add(`${h.q},${h.r}`));
    attackableRange.forEach((h) => changedTiles.add(`${h.q},${h.r}`));
    units.forEach((u) => changedTiles.add(`${u.position.q},${u.position.r}`));

    for (const key of changedTiles) {
      const [q, r] = key.split(",").map(Number);
      const tile = tiles.find((t) => t.q === q && t.r === r);
      if (!tile) continue;

      const { x, y } = hexToPixel(q, r);
      const sx = x + centerX;
      const sy = y + centerY;
      const terrainColor = TERRAIN_COLORS[tile.terrain];
      let strokeColor = "#1A3F35";

      if (movableSet.has(key)) {
        strokeColor = "#4CAF50";
      } else if (attackableSet.has(key)) {
        strokeColor = "#D44B3F";
      }

      if (movableSet.has(key)) {
        ctx.globalAlpha = 0.25;
        drawHex(ctx, sx, sy, HEX_SIZE - 1, "rgba(76,175,80,0.5)", strokeColor);
        ctx.globalAlpha = 1;
      }
      if (attackableSet.has(key)) {
        ctx.globalAlpha = 0.25;
        drawHex(ctx, sx, sy, HEX_SIZE - 1, "rgba(212,75,63,0.5)", strokeColor);
        ctx.globalAlpha = 1;
      }
    }

    const anim = animRef.current;
    const now = performance.now();
    const animProgress = anim ? Math.min(1, (now - anim.startTime) / ANIMATION_DURATION) : 1;

    const visibleUnits = units.filter((u) => u.status !== "destroyed");
    const sortedUnits = [...visibleUnits].sort((a, b) => {
      const posA = getInterpolatedPos(a, animProgress);
      const posB = getInterpolatedPos(b, animProgress);
      return posA.r - posB.r;
    });

    for (const unit of sortedUnits) {
      const pos = getInterpolatedPos(unit, animProgress);
      const { x, y } = hexToPixel(pos.q, pos.r);
      const sx = x + centerX;
      const sy = y + centerY;
      const isSelected = selectedUnit?.id === unit.id;
      drawUnit(ctx, sx, sy, unit, isSelected);
    }

    if (anim?.type === "battle" && anim.battlePos && animProgress < 1) {
      const { x, y } = hexToPixel(anim.battlePos.q, anim.battlePos.r);
      const sx = x + centerX;
      const sy = y + centerY;
      drawBattleEffect(ctx, sx, sy, animProgress);
    }

    ctx.restore();
  }, [tiles, units, selectedUnit, movableRange, attackableRange, getInterpolatedPos]);

  const renderLoop = useCallback(() => {
    render();
    const anim = animRef.current;
    if (anim && performance.now() - anim.startTime < ANIMATION_DURATION) {
      rafRef.current = requestAnimationFrame(renderLoop);
    }
  }, [render]);

  const startAnimation = useCallback((anim: Omit<AnimState, "startTime">) => {
    animRef.current = { ...anim, startTime: performance.now() };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [renderLoop]);

  useEffect(() => {
    buildBackground();
  }, [tileHash, buildBackground]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      render();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    resize();

    return () => ro.disconnect();
  }, [render]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderLoop]);

  useEffect(() => {
    if (movements.length > 0) {
      const lastMove = movements[movements.length - 1];
      startAnimation({
        type: "move",
        unitId: lastMove.unitId,
        fromPos: lastMove.from,
        toPos: lastMove.to,
      });
    }
    if (battles.length > 0) {
      const lastBattle = battles[battles.length - 1];
      const defender = units.find((u) => u.id === lastBattle.defenderId);
      if (defender) {
        setTimeout(() => {
          startAnimation({
            type: "battle",
            unitId: lastBattle.defenderId,
            battlePos: defender.position,
          });
        }, 150);
      }
    }
  }, [movements, battles]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || draggingRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left - offsetRef.current.x) / scaleRef.current;
    const py = (e.clientY - rect.top - offsetRef.current.y) / scaleRef.current;
    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2 / scaleRef.current - offsetRef.current.x / scaleRef.current;
    const centerY = h / 2 / scaleRef.current - offsetRef.current.y / scaleRef.current;
    const { q, r } = pixelToHex(px - centerX, py - centerY);

    const clickedUnit = units.find(
      (u) => u.position.q === q && u.position.r === r && u.status !== "destroyed"
    );
    if (clickedUnit && onUnitClick) {
      onUnitClick(clickedUnit.id);
    } else if (onHexClick) {
      onHexClick(q, r);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scaleRef.current = Math.max(0.3, Math.min(3, scaleRef.current * delta));
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderLoop);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    draggingRef.current = false;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1) return;
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) draggingRef.current = true;
    offsetRef.current.x += dx;
    offsetRef.current.y += dy;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderLoop);
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair"
      onClick={handleClick}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={() => { draggingRef.current = false; }}
    />
  );
}
