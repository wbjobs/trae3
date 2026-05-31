import type { TerrainType, UnitType, Faction, Position, TerrainCell, MapConfig } from '@shared/types'
import { TERRAIN_COLORS, UNIT_STATS } from '@shared/types'

const HEX_SIZE = 28
const SQRT3 = Math.sqrt(3)

export function getVisibleHexRange(
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
  const hexWidth = HEX_SIZE * SQRT3
  const hexHeight = HEX_SIZE * 1.5

  const viewLeft = -offsetX / zoom - hexWidth
  const viewRight = (canvasWidth - offsetX) / zoom + hexWidth
  const viewTop = -offsetY / zoom - hexHeight
  const viewBottom = (canvasHeight - offsetY) / zoom + hexHeight

  const topLeft = pixelToHex(viewLeft, viewTop)
  const topRight = pixelToHex(viewRight, viewTop)
  const bottomLeft = pixelToHex(viewLeft, viewBottom)
  const bottomRight = pixelToHex(viewRight, viewBottom)

  const minCol = Math.max(0, Math.min(topLeft.col, topRight.col, bottomLeft.col, bottomRight.col) - 1)
  const maxCol = Math.min(width - 1, Math.max(topLeft.col, topRight.col, bottomLeft.col, bottomRight.col) + 1)
  const minRow = Math.max(0, Math.min(topLeft.row, topRight.row, bottomLeft.row, bottomRight.row) - 1)
  const maxRow = Math.min(height - 1, Math.max(topLeft.row, topRight.row, bottomLeft.row, bottomRight.row) + 1)

  return { minCol, maxCol, minRow, maxRow }
}

export function hexToPixel(col: number, row: number): Position {
  const x = HEX_SIZE * (SQRT3 * col + SQRT3 / 2 * (row & 1))
  const y = HEX_SIZE * (1.5 * row)
  return { x, y }
}

export function pixelToHex(px: number, py: number): { col: number; row: number } {
  const q = (SQRT3 / 3 * px - 1 / 3 * py) / HEX_SIZE
  const r = (2 / 3 * py) / HEX_SIZE
  return hexRound(q, r)
}

function hexRound(q: number, r: number): { col: number; row: number } {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(s)
  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - s)
  if (dq > dr && dq > ds) {
    rq = -rr - rs
  } else if (dr > ds) {
    rr = -rq - rs
  }
  return { col: rq, row: rr }
}

export function drawHexGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  terrains: TerrainCell[],
  offsetX: number,
  offsetY: number,
  zoom: number,
) {
  const terrainMap = new Map<string, TerrainCell>()
  terrains.forEach((t) => terrainMap.set(`${t.x},${t.y}`, t))

  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(zoom, zoom)

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const pos = hexToPixel(col, row)
      const cell = terrainMap.get(`${col},${row}`)
      const terrainType: TerrainType = cell?.type ?? 'plain'
      const color = TERRAIN_COLORS[terrainType]

      drawHexCell(ctx, pos.x, pos.y, color)
      drawTerrainPattern(ctx, pos.x, pos.y, terrainType)
    }
  }

  ctx.restore()
}

function drawHexCell(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  fillColor: string,
) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    const x = cx + HEX_SIZE * Math.cos(angle)
    const y = cy + HEX_SIZE * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = fillColor
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawTerrainPattern(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  type: TerrainType,
) {
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 1

  switch (type) {
    case 'mountain':
      ctx.beginPath()
      ctx.moveTo(cx - 8, cy + 6)
      ctx.lineTo(cx, cy - 8)
      ctx.lineTo(cx + 8, cy + 6)
      ctx.stroke()
      break
    case 'forest':
      ctx.beginPath()
      ctx.moveTo(cx, cy - 6)
      ctx.lineTo(cx - 5, cy + 3)
      ctx.lineTo(cx + 5, cy + 3)
      ctx.closePath()
      ctx.stroke()
      break
    case 'urban':
      ctx.strokeRect(cx - 5, cy - 5, 10, 10)
      break
    case 'water':
      ctx.beginPath()
      ctx.moveTo(cx - 8, cy)
      ctx.quadraticCurveTo(cx - 4, cy - 4, cx, cy)
      ctx.quadraticCurveTo(cx + 4, cy + 4, cx + 8, cy)
      ctx.stroke()
      break
    case 'road':
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(cx - 10, cy)
      ctx.lineTo(cx + 10, cy)
      ctx.stroke()
      ctx.setLineDash([])
      break
  }
  ctx.restore()
}

export function drawUnit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  unitType: UnitType,
  faction: Faction,
  selected: boolean,
  strength: number,
  maxStrength: number,
) {
  const factionColor = faction === 'red' ? '#C62828' : '#1565C0'
  const size = 12

  ctx.save()

  if (selected) {
    ctx.shadowColor = factionColor
    ctx.shadowBlur = 15
    ctx.beginPath()
    ctx.arc(cx, cy, size + 4, 0, Math.PI * 2)
    ctx.strokeStyle = factionColor
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  ctx.beginPath()
  ctx.arc(cx, cy, size, 0, Math.PI * 2)
  ctx.fillStyle = factionColor
  ctx.globalAlpha = 0.3
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = factionColor
  ctx.lineWidth = 2
  ctx.stroke()

  drawNatoSymbol(ctx, cx, cy, unitType, factionColor)

  const barW = size * 2
  const barH = 3
  const barX = cx - barW / 2
  const barY = cy + size + 3
  const hpRatio = strength / maxStrength

  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(barX, barY, barW, barH)
  ctx.fillStyle = hpRatio > 0.5 ? '#4CAF50' : hpRatio > 0.25 ? '#FF8F00' : '#C62828'
  ctx.fillRect(barX, barY, barW * hpRatio, barH)

  ctx.restore()
}

function drawNatoSymbol(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  unitType: UnitType,
  color: string,
) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.5

  switch (unitType) {
    case 'infantry':
      ctx.beginPath()
      ctx.moveTo(cx - 5, cy - 5)
      ctx.lineTo(cx + 5, cy + 5)
      ctx.moveTo(cx + 5, cy - 5)
      ctx.lineTo(cx - 5, cy + 5)
      ctx.stroke()
      break
    case 'armor':
      ctx.beginPath()
      ctx.ellipse(cx, cy, 7, 5, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'artillery':
      ctx.beginPath()
      ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.moveTo(cx - 7, cy - 7)
      ctx.lineTo(cx + 7, cy + 7)
      ctx.moveTo(cx + 7, cy - 7)
      ctx.lineTo(cx - 7, cy + 7)
      ctx.stroke()
      break
    case 'recon':
      ctx.beginPath()
      ctx.moveTo(cx - 5, cy - 5)
      ctx.lineTo(cx + 5, cy)
      ctx.lineTo(cx - 5, cy + 5)
      ctx.closePath()
      ctx.stroke()
      break
    case 'supply':
      ctx.beginPath()
      ctx.moveTo(cx, cy - 5)
      ctx.lineTo(cx + 5, cy + 5)
      ctx.lineTo(cx - 5, cy + 5)
      ctx.closePath()
      ctx.stroke()
      break
  }
}

export function drawMovementRange(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  range: number,
  zoom: number,
) {
  const radius = range * HEX_SIZE * SQRT3 * zoom
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(196,163,90,0.1)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(196,163,90,0.4)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 5])
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

export function drawCoordinates(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  canvasWidth?: number,
  canvasHeight?: number,
) {
  if (zoom <= 0.6) return

  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(zoom, zoom)
  ctx.font = '8px "JetBrains Mono"'
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.textAlign = 'center'

  let minCol = 0, maxCol = width - 1, minRow = 0, maxRow = height - 1
  if (canvasWidth !== undefined && canvasHeight !== undefined) {
    const range = getVisibleHexRange(width, height, offsetX, offsetY, zoom, canvasWidth, canvasHeight)
    minCol = range.minCol
    maxCol = range.maxCol
    minRow = range.minRow
    maxRow = range.maxRow
  }

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const pos = hexToPixel(col, row)
      ctx.fillText(`${col},${row}`, pos.x, pos.y + HEX_SIZE - 4)
    }
  }
  ctx.restore()
}

export function findUnitAtPixel(
  px: number,
  py: number,
  unitPositions: Array<{ unitId: string; position: Position }>,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cachedScreenPositions?: Map<string, { x: number; y: number }>,
): { unitId: string; screenPos: { x: number; y: number } } | null {
  const cellSize = 28 * zoom
  const hashX = Math.floor(px / cellSize)
  const hashY = Math.floor(py / cellSize)

  let bestId: string | null = null
  let bestDist = Infinity
  let bestScreenPos = { x: 0, y: 0 }

  for (const u of unitPositions) {
    let sx: number, sy: number

    if (cachedScreenPositions) {
      const cached = cachedScreenPositions.get(u.unitId)
      if (cached) {
        sx = cached.x
        sy = cached.y
      } else {
        const actualPixel = hexToPixel(u.position.x, u.position.y)
        sx = actualPixel.x * zoom + offsetX
        sy = actualPixel.y * zoom + offsetY
        cachedScreenPositions.set(u.unitId, { x: sx, y: sy })
      }
    } else {
      const actualPixel = hexToPixel(u.position.x, u.position.y)
      sx = actualPixel.x * zoom + offsetX
      sy = actualPixel.y * zoom + offsetY
    }

    const unitHashX = Math.floor(sx / cellSize)
    const unitHashY = Math.floor(sy / cellSize)
    if (Math.abs(unitHashX - hashX) > 1 || Math.abs(unitHashY - hashY) > 1) {
      continue
    }

    const dx = px - sx
    const dy = py - sy
    const distSq = dx * dx + dy * dy
    const hitRadius = 14 * zoom

    if (distSq < hitRadius * hitRadius) {
      if (distSq < bestDist) {
        bestDist = distSq
        bestId = u.unitId
        bestScreenPos = { x: sx, y: sy }
      }
    }
  }

  if (bestId) {
    return { unitId: bestId, screenPos: bestScreenPos }
  }
  return null
}

export class TerrainCache {
  private offscreenCanvas: OffscreenCanvas | null = null
  private offscreenCtx: OffscreenCanvasRenderingContext2D | null = null
  private isDirty = true
  private lastMapConfigKey = ''

  preRender(mapConfig: MapConfig): void {
    const configKey = `${mapConfig.mapId}-${mapConfig.width}-${mapConfig.height}`
    if (!this.isDirty && configKey === this.lastMapConfigKey && this.offscreenCanvas) {
      return
    }

    const hexWidth = HEX_SIZE * SQRT3
    const hexHeight = HEX_SIZE * 1.5
    const totalWidth = mapConfig.width * hexWidth + hexWidth / 2
    const totalHeight = mapConfig.height * hexHeight + HEX_SIZE

    this.offscreenCanvas = new OffscreenCanvas(totalWidth, totalHeight)
    this.offscreenCtx = this.offscreenCanvas.getContext('2d')
    if (!this.offscreenCtx) return

    const terrainMap = new Map<string, TerrainCell>()
    mapConfig.terrains.forEach((t) => terrainMap.set(`${t.x},${t.y}`, t))

    this.offscreenCtx.fillStyle = '#0F0F1E'
    this.offscreenCtx.fillRect(0, 0, totalWidth, totalHeight)

    for (let row = 0; row < mapConfig.height; row++) {
      for (let col = 0; col < mapConfig.width; col++) {
        const pos = hexToPixel(col, row)
        const cell = terrainMap.get(`${col},${row}`)
        const terrainType: TerrainType = cell?.type ?? 'plain'
        const color = TERRAIN_COLORS[terrainType]

        drawHexCell(this.offscreenCtx, pos.x, pos.y, color)
        drawTerrainPattern(this.offscreenCtx, pos.x, pos.y, terrainType)
      }
    }

    this.isDirty = false
    this.lastMapConfigKey = configKey
  }

  render(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, zoom: number): void {
    if (!this.offscreenCanvas) return

    ctx.save()
    ctx.translate(offsetX, offsetY)
    ctx.scale(zoom, zoom)
    ctx.drawImage(this.offscreenCanvas, 0, 0)
    ctx.restore()
  }

  invalidate(): void {
    this.isDirty = true
    this.lastMapConfigKey = ''
  }
}

export { HEX_SIZE, SQRT3 }
