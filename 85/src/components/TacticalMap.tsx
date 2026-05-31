import { useRef, useEffect, useCallback } from 'react'
import { useGameStore } from '@/store/gameStore'
import {
  drawHexGrid,
  drawUnit,
  drawMovementRange,
  drawCoordinates,
  findUnitAtPixel,
  hexToPixel,
  getVisibleHexRange,
  TerrainCache,
  HEX_SIZE,
  SQRT3,
} from '@/lib/mapRenderer'
import { UNIT_STATS } from '@shared/types'

export default function TacticalMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef({ x: 40, y: 40 })
  const zoomRef = useRef(1)
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0 })
  const rafRef = useRef<number>(0)
  const dirtyRef = useRef(true)
  const terrainCacheRef = useRef<TerrainCache>(new TerrainCache())
  const unitScreenPosCacheRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const lastMapConfigIdRef = useRef<string>('')

  const gameState = useGameStore((s) => s.gameState)
  const mapConfig = useGameStore((s) => s.mapConfig)
  const selectedUnit = useGameStore((s) => s.selectedUnit)
  const setSelectedUnit = useGameStore((s) => s.setSelectedUnit)

  const requestRender = useCallback(() => {
    dirtyRef.current = true
  }, [])

  const render = useCallback(() => {
    if (!dirtyRef.current) {
      rafRef.current = requestAnimationFrame(render)
      return
    }
    dirtyRef.current = false

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    ctx.fillStyle = '#0F0F1E'
    ctx.fillRect(0, 0, rect.width, rect.height)

    const mapW = mapConfig?.width ?? 16
    const mapH = mapConfig?.height ?? 12
    const { x: ox, y: oy } = offsetRef.current
    const zoom = zoomRef.current

    if (mapConfig) {
      if (mapConfig.mapId !== lastMapConfigIdRef.current) {
        terrainCacheRef.current.invalidate()
        unitScreenPosCacheRef.current.clear()
        lastMapConfigIdRef.current = mapConfig.mapId
      }
      terrainCacheRef.current.preRender(mapConfig)
      terrainCacheRef.current.render(ctx, ox, oy, zoom)
    } else {
      const terrains = mapConfig?.terrains ?? []
      drawHexGrid(ctx, mapW, mapH, terrains, ox, oy, zoom)
    }

    drawCoordinates(ctx, mapW, mapH, ox, oy, zoom, rect.width, rect.height)

    const units = gameState?.units ?? []
    unitScreenPosCacheRef.current.clear()
    for (const unit of units) {
      const hexPos = hexToPixel(unit.position.x, unit.position.y)
      const sx = hexPos.x * zoom + ox
      const sy = hexPos.y * zoom + oy
      unitScreenPosCacheRef.current.set(unit.unitId, { x: sx, y: sy })
      drawUnit(ctx, sx, sy, unit.unitType, unit.faction, unit.unitId === selectedUnit?.unitId, unit.strength, unit.maxStrength)
    }

    if (selectedUnit) {
      const cachedPos = unitScreenPosCacheRef.current.get(selectedUnit.unitId)
      let sx: number, sy: number
      if (cachedPos) {
        sx = cachedPos.x
        sy = cachedPos.y
      } else {
        const hexPos = hexToPixel(selectedUnit.position.x, selectedUnit.position.y)
        sx = hexPos.x * zoom + ox
        sy = hexPos.y * zoom + oy
      }
      const stats = UNIT_STATS[selectedUnit.unitType]
      drawMovementRange(ctx, sx, sy, stats.movement, zoom)
    }

    rafRef.current = requestAnimationFrame(render)
  }, [gameState, mapConfig, selectedUnit])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [render])

  useEffect(() => {
    unitScreenPosCacheRef.current.clear()
    requestRender()
  }, [gameState, mapConfig, selectedUnit, requestRender])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      dragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        startOffX: offsetRef.current.x,
        startOffY: offsetRef.current.y,
      }
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.dragging) {
      offsetRef.current = {
        x: dragRef.current.startOffX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.startOffY + (e.clientY - dragRef.current.startY),
      }
      unitScreenPosCacheRef.current.clear()
      requestRender()
    }
  }, [requestRender])

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    const units = gameState?.units ?? []
    const unitPositions = units.map((u) => ({ unitId: u.unitId, position: u.position }))
    const found = findUnitAtPixel(
      px,
      py,
      unitPositions,
      offsetRef.current.x,
      offsetRef.current.y,
      zoomRef.current,
      unitScreenPosCacheRef.current,
    )

    if (found) {
      const unit = units.find((u) => u.unitId === found.unitId)
      setSelectedUnit(unit ?? null)
    } else {
      setSelectedUnit(null)
    }
  }, [gameState, setSelectedUnit])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.3, Math.min(3, zoomRef.current * delta))
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    offsetRef.current = {
      x: mx - (mx - offsetRef.current.x) * (newZoom / zoomRef.current),
      y: my - (my - offsetRef.current.y) * (newZoom / zoomRef.current),
    }
    zoomRef.current = newZoom
    unitScreenPosCacheRef.current.clear()
    requestRender()
  }, [requestRender])

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />
      <div className="absolute bottom-2 left-2 text-xs font-mono text-text-muted bg-charcoal/70 px-2 py-1 rounded-military">
        缩放: {(zoomRef.current * 100).toFixed(0)}%
      </div>
    </div>
  )
}
