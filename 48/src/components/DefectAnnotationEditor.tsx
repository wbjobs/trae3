import React, { useRef, useState, useEffect, useCallback } from "react"
import type { DefectRecord, BoundingBox, DefectUpdate } from "@/types"
import { updateDefect, redrawDefectAnnotation } from "@/api/client"

interface DefectAnnotationEditorProps {
  defect: DefectRecord
  imageUrl: string
  onClose: () => void
  onUpdated: (updated: DefectRecord) => void
}

const SEVERITY_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
  critical: "#7c3aed",
}

const SEVERITY_OPTIONS = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "critical", label: "严重" },
]

const DEFECT_TYPE_OPTIONS = [
  { value: "scratch", label: "划痕" },
  { value: "dent", label: "凹陷" },
  { value: "crack", label: "裂纹" },
  { value: "discoloration", label: "变色" },
  { value: "foreign_material", label: "异物" },
  { value: "stain", label: "污渍" },
  { value: "edge_chip", label: "边缘缺损" },
  { value: "bubble", label: "气泡" },
  { value: "other", label: "其他" },
]

const HANDLE_SIZE = 8

type DragMode =
  | { type: "move"; startX: number; startY: number; startBbox: BoundingBox }
  | { type: "resize"; handle: string; startX: number; startY: number; startBbox: BoundingBox }
  | null

export function DefectAnnotationEditor({ defect, imageUrl, onClose, onUpdated }: DefectAnnotationEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [localBbox, setLocalBbox] = useState<BoundingBox>({
    x: defect.type === "other" ? 100 : (defect as any).bbox?.x ?? 100,
    y: defect.type === "other" ? 100 : (defect as any).bbox?.y ?? 100,
    width: defect.type === "other" ? 120 : (defect as any).bbox?.width ?? 120,
    height: defect.type === "other" ? 80 : (defect as any).bbox?.height ?? 80,
  })
  const [localType, setLocalType] = useState(defect.type)
  const [localSeverity, setLocalSeverity] = useState(defect.severity)
  const [localConfidence, setLocalConfidence] = useState(defect.confidence)
  const [localDescription, setLocalDescription] = useState(defect.description || "")

  const [scale, setScale] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [drag, setDrag] = useState<DragMode>(null)
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [redrawImage, setRedrawImage] = useState<string | null>(null)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      imgRef.current = img
      requestAnimationFrame(draw)
    }
    img.src = imageUrl
    return () => { img.onload = null; img.onerror = null }
  }, [imageUrl, redrawImage])

  useEffect(() => {
    requestAnimationFrame(draw)
  }, [localBbox, localSeverity, localType, scale, offsetX, offsetY])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    const img = imgRef.current
    const container = containerRef.current
    if (!canvas || !ctx || !img || !container) return

    const cw = container.clientWidth
    const ch = Math.min(600, container.clientWidth * 0.75)
    canvas.width = cw
    canvas.height = ch

    const sx = cw / img.naturalWidth
    const sy = ch / img.naturalHeight
    const s = Math.min(sx, sy, 1)
    const ox = (cw - img.naturalWidth * s) / 2
    const oy = (ch - img.naturalHeight * s) / 2
    setScale(s)
    setOffsetX(ox)
    setOffsetY(oy)

    ctx.clearRect(0, 0, cw, ch)
    ctx.drawImage(img, ox, oy, img.naturalWidth * s, img.naturalHeight * s)

    const color = SEVERITY_COLORS[localSeverity] || "#2563eb"
    const bx = ox + localBbox.x * s
    const by = oy + localBbox.y * s
    const bw = localBbox.width * s
    const bh = localBbox.height * s

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.strokeRect(bx, by, bw, bh)

    ctx.fillStyle = color
    ctx.font = "bold 11px system-ui, sans-serif"
    const typeLabel = DEFECT_TYPE_OPTIONS.find(o => o.value === localType)?.label || localType
    const sevLabel = SEVERITY_OPTIONS.find(o => o.value === localSeverity)?.label || localSeverity
    const label = `${typeLabel} (${sevLabel})`
    const tw = ctx.measureText(label).width + 8
    ctx.fillRect(bx, by - 18, tw, 18)
    ctx.fillStyle = "#ffffff"
    ctx.fillText(label, bx + 4, by - 5)

    const handles = [
      { k: "nw", x: bx - HANDLE_SIZE / 2, y: by - HANDLE_SIZE / 2 },
      { k: "n", x: bx + bw / 2 - HANDLE_SIZE / 2, y: by - HANDLE_SIZE / 2 },
      { k: "ne", x: bx + bw - HANDLE_SIZE / 2, y: by - HANDLE_SIZE / 2 },
      { k: "e", x: bx + bw - HANDLE_SIZE / 2, y: by + bh / 2 - HANDLE_SIZE / 2 },
      { k: "se", x: bx + bw - HANDLE_SIZE / 2, y: by + bh - HANDLE_SIZE / 2 },
      { k: "s", x: bx + bw / 2 - HANDLE_SIZE / 2, y: by + bh - HANDLE_SIZE / 2 },
      { k: "sw", x: bx - HANDLE_SIZE / 2, y: by + bh - HANDLE_SIZE / 2 },
      { k: "w", x: bx - HANDLE_SIZE / 2, y: by + bh / 2 - HANDLE_SIZE / 2 },
    ]
    handles.forEach(h => {
      ctx.fillStyle = activeHandle === h.k ? "#0ea5e9" : "#ffffff"
      ctx.fillRect(h.x, h.y, HANDLE_SIZE, HANDLE_SIZE)
      ctx.strokeStyle = "#1e40af"
      ctx.lineWidth = 1
      ctx.strokeRect(h.x, h.y, HANDLE_SIZE, HANDLE_SIZE)
    })
  }, [localBbox, localSeverity, localType, activeHandle])

  const toImageCoords = (cx: number, cy: number) => ({
    x: (cx - offsetX) / scale,
    y: (cy - offsetY) / scale,
  })

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const bx = offsetX + localBbox.x * scale
    const by = offsetY + localBbox.y * scale
    const bw = localBbox.width * scale
    const bh = localBbox.height * scale

    const handles = [
      { k: "nw", x: bx - HANDLE_SIZE / 2, y: by - HANDLE_SIZE / 2 },
      { k: "n", x: bx + bw / 2 - HANDLE_SIZE / 2, y: by - HANDLE_SIZE / 2 },
      { k: "ne", x: bx + bw - HANDLE_SIZE / 2, y: by - HANDLE_SIZE / 2 },
      { k: "e", x: bx + bw - HANDLE_SIZE / 2, y: by + bh / 2 - HANDLE_SIZE / 2 },
      { k: "se", x: bx + bw - HANDLE_SIZE / 2, y: by + bh - HANDLE_SIZE / 2 },
      { k: "s", x: bx + bw / 2 - HANDLE_SIZE / 2, y: by + bh - HANDLE_SIZE / 2 },
      { k: "sw", x: bx - HANDLE_SIZE / 2, y: by + bh - HANDLE_SIZE / 2 },
      { k: "w", x: bx - HANDLE_SIZE / 2, y: by + bh / 2 - HANDLE_SIZE / 2 },
    ]

    for (const h of handles) {
      if (mx >= h.x && mx <= h.x + HANDLE_SIZE && my >= h.y && my <= h.y + HANDLE_SIZE) {
        setActiveHandle(h.k)
        setDrag({ type: "resize", handle: h.k, startX: mx, startY: my, startBbox: { ...localBbox } })
        return
      }
    }

    if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
      setActiveHandle("move")
      setDrag({ type: "move", startX: mx, startY: my, startBbox: { ...localBbox } })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag) {
      const rect = canvasRef.current!.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const bx = offsetX + localBbox.x * scale
      const by = offsetY + localBbox.y * scale
      const bw = localBbox.width * scale
      const bh = localBbox.height * scale

      const handles = [
        { k: "nw", x: bx - HANDLE_SIZE / 2, y: by - HANDLE_SIZE / 2 },
        { k: "n", x: bx + bw / 2 - HANDLE_SIZE / 2, y: by - HANDLE_SIZE / 2 },
        { k: "ne", x: bx + bw - HANDLE_SIZE / 2, y: by - HANDLE_SIZE / 2 },
        { k: "e", x: bx + bw - HANDLE_SIZE / 2, y: by + bh / 2 - HANDLE_SIZE / 2 },
        { k: "se", x: bx + bw - HANDLE_SIZE / 2, y: by + bh - HANDLE_SIZE / 2 },
        { k: "s", x: bx + bw / 2 - HANDLE_SIZE / 2, y: by + bh - HANDLE_SIZE / 2 },
        { k: "sw", x: bx - HANDLE_SIZE / 2, y: by + bh - HANDLE_SIZE / 2 },
        { k: "w", x: bx - HANDLE_SIZE / 2, y: by + bh / 2 - HANDLE_SIZE / 2 },
      ]

      let hover: string | null = null
      for (const h of handles) {
        if (mx >= h.x && mx <= h.x + HANDLE_SIZE && my >= h.y && my <= h.y + HANDLE_SIZE) {
          hover = h.k
          break
        }
      }
      if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
        canvasRef.current!.style.cursor = "move"
      } else if (hover) {
        const cursors: Record<string, string> = {
          nw: "nw-resize", n: "n-resize", ne: "ne-resize",
          e: "e-resize", se: "se-resize", s: "s-resize",
          sw: "sw-resize", w: "w-resize",
        }
        canvasRef.current!.style.cursor = cursors[hover] || "default"
      } else {
        canvasRef.current!.style.cursor = "default"
      }
      return
    }

    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const dx = (mx - drag.startX) / scale
    const dy = (my - drag.startY) / scale

    let newBbox = { ...drag.startBbox }
    if (drag.type === "move") {
      newBbox.x = drag.startBbox.x + dx
      newBbox.y = drag.startBbox.y + dy
    } else {
      const h = drag.handle
      if (h.includes("e")) newBbox.width = drag.startBbox.width + dx
      if (h.includes("s")) newBbox.height = drag.startBbox.height + dy
      if (h.includes("w")) {
        newBbox.x = drag.startBbox.x + dx
        newBbox.width = drag.startBbox.width - dx
      }
      if (h.includes("n")) {
        newBbox.y = drag.startBbox.y + dy
        newBbox.height = drag.startBbox.height - dy
      }
    }

    newBbox.width = Math.max(10, newBbox.width)
    newBbox.height = Math.max(10, newBbox.height)
    setLocalBbox(newBbox)
  }

  const handleMouseUp = () => {
    setDrag(null)
    setActiveHandle(null)
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const update: DefectUpdate = {
        bbox: localBbox,
        type: localType,
        severity: localSeverity,
        confidence: localConfidence,
        description: localDescription,
      }
      const updated = await updateDefect(defect.id, update)
      onUpdated(updated)
    } catch (e) {
      console.error("Failed to update defect:", e)
      alert("更新失败")
    } finally {
      setLoading(false)
    }
  }

  const handleRedraw = async () => {
    setLoading(true)
    try {
      const result = await redrawDefectAnnotation(defect.id)
      setRedrawImage(`data:image/jpeg;base64,${result.image_base64}`)
      alert("标注图已重绘")
    } catch (e) {
      console.error("Failed to redraw:", e)
      alert("重绘失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">缺陷区域标注编辑</h2>
            <p className="text-sm text-slate-500 mt-0.5">拖拽调整矩形框、修改属性后保存</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 bg-slate-50 p-4 overflow-auto">
            <div ref={containerRef} className="w-full">
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="bg-slate-900 rounded-lg border border-slate-200 shadow-sm"
              />
            </div>
          </div>

          <div className="w-80 border-l border-slate-200 p-5 space-y-5 overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">缺陷类型</label>
              <select
                value={localType}
                onChange={e => setLocalType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {DEFECT_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">严重程度</label>
              <select
                value={localSeverity}
                onChange={e => setLocalSeverity(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {SEVERITY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                置信度: {(localConfidence * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.01"
                value={localConfidence}
                onChange={e => setLocalConfidence(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">描述</label>
              <textarea
                value={localDescription}
                onChange={e => setLocalDescription(e.target.value)}
                rows={3}
                placeholder="输入缺陷描述..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">X</span>
                <span className="font-mono text-slate-700">{localBbox.x.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Y</span>
                <span className="font-mono text-slate-700">{localBbox.y.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">宽度</span>
                <span className="font-mono text-slate-700">{localBbox.width.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">高度</span>
                <span className="font-mono text-slate-700">{localBbox.height.toFixed(0)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={handleRedraw}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            重绘标注图
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              保存修改
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
