import React, { useEffect, useRef, useState, useCallback } from 'react'
import { fabric } from 'fabric'
import { Button, Space, Input, Slider, ColorPicker, Popconfirm, Tooltip, Divider, message } from 'antd'
import {
  UndoOutlined,
  RedoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  DeleteOutlined,
  DotChartOutlined,
  LineOutlined,
  BgColorsOutlined,
  BorderOutlined,
  ClearOutlined,
  PicCenterOutlined,
  FontSizeOutlined,
  DragOutlined
} from '@ant-design/icons'
import { useAppDispatch, useAppSelector } from '@/store'
import {
  addAnnotation,
  deleteAnnotation,
  undoAnnotation,
  redoAnnotation
} from '@/store/specimen'
import { AnnotationTypeFront, ANNOTATION_TYPE_TO_CODE, ANNOTATION_TYPE_MAP } from '@/types'
import { annotationApi } from '@/api'
import styles from './index.module.css'

const ANNOTATION_TYPES: { value: AnnotationTypeFront; label: string; icon: React.ReactNode }[] = [
  { value: 'rectangle', label: '矩形', icon: <BorderOutlined /> },
  { value: 'polygon', label: '多边形', icon: <BgColorsOutlined /> },
  { value: 'circle', label: '圆形', icon: <DotChartOutlined /> },
  { value: 'point', label: '点', icon: <DotChartOutlined /> },
  { value: 'line', label: '线条', icon: <LineOutlined /> },
  { value: 'text', label: '文字', icon: <FontSizeOutlined /> }
]

const DEFAULT_COLORS = ['#ff4d4f', '#fa8c16', '#faad14', '#52c41a', '#1890ff', '#722ed1', '#eb2f96']

interface CanvasAnnotatorProps {
  imageUrl: string
  imageWidth?: number
  imageHeight?: number
  specimenId: number
  imageId: number
}

const CanvasAnnotator: React.FC<CanvasAnnotatorProps> = ({
  imageUrl,
  specimenId,
  imageId
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvas = useRef<fabric.Canvas | null>(null)
  const isDrawing = useRef(false)
  const currentPoints = useRef<number[]>([])
  const currentPath = useRef<{ x: number; y: number }[]>([])

  const dispatch = useAppDispatch()
  const { annotations, selectedAnnotation, historyIndex, annotationHistory } = useAppSelector(
    (state) => state.specimen
  )

  const [tool, setTool] = useState<AnnotationTypeFront | 'select' | 'pan'>('select')
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('#ff4d4f')
  const [confidence, setConfidence] = useState(100)
  const [zoom, setZoom] = useState(1)

  const buildCoordinates = (type: AnnotationTypeFront, points: number[]): string => {
    switch (type) {
      case 'rectangle': {
        const [x, y, x2, , , y2] = points.length >= 6 ? points : [points[0], points[1], points[0] + 100, points[1], points[0] + 100, points[1] + 100]
        return JSON.stringify({ x, y, width: x2 - x, height: y2 - y })
      }
      case 'polygon': {
        const pts: { x: number; y: number }[] = []
        for (let i = 0; i < points.length; i += 2) {
          pts.push({ x: points[i], y: points[i + 1] })
        }
        return JSON.stringify(pts)
      }
      case 'point':
        return JSON.stringify({ x: points[0], y: points[1] })
      case 'circle': {
        const [cx, cy, r] = points.length >= 3 ? points : [points[0], points[1], 0]
        return JSON.stringify({ x: cx, y: cy, r })
      }
      case 'line': {
        const pts: { x: number; y: number }[] = []
        for (let i = 0; i < points.length; i += 2) {
          pts.push({ x: points[i], y: points[i + 1] })
        }
        return JSON.stringify(pts)
      }
      case 'text':
        return JSON.stringify({ x: points[0], y: points[1], text: label })
      default:
        return JSON.stringify(points)
    }
  }

  const initCanvas = useCallback(() => {
    if (!canvasRef.current) return

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#f5f5f5',
      selection: tool === 'select'
    })

    fabricCanvas.current = canvas

    fabric.Image.fromURL(imageUrl, (img) => {
      const scale = Math.min(800 / (img.width || 1), 600 / (img.height || 1))
      img.scale(scale)
      img.set({
        left: (800 - (img.width || 1) * scale) / 2,
        top: (600 - (img.height || 1) * scale) / 2,
        selectable: false,
        evented: false
      })
      canvas.add(img)
      canvas.sendToBack(img)
    })

    canvas.on('mouse:down', handleMouseDown)
    canvas.on('mouse:move', handleMouseMove)
    canvas.on('mouse:up', handleMouseUp)

    return () => {
      canvas.dispose()
    }
  }, [imageUrl])

  useEffect(() => {
    const cleanup = initCanvas()
    return cleanup
  }, [initCanvas])

  useEffect(() => {
    if (fabricCanvas.current) {
      fabricCanvas.current.selection = tool === 'select'
    }
  }, [tool])

  const handleMouseDown = (options: fabric.IEvent) => {
    if (tool === 'select' || tool === 'pan') return

    const pointer = fabricCanvas.current?.getPointer(options.e)
    if (!pointer) return

    isDrawing.current = true
    currentPoints.current = [pointer.x, pointer.y]
    currentPath.current = [{ x: pointer.x, y: pointer.y }]

    switch (tool) {
      case 'rectangle': {
        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: 'transparent',
          stroke: color,
          strokeWidth: 2
        })
        fabricCanvas.current?.add(rect)
        break
      }
      case 'circle': {
        const circle = new fabric.Circle({
          left: pointer.x,
          top: pointer.y,
          radius: 0,
          fill: 'transparent',
          stroke: color,
          strokeWidth: 2
        })
        fabricCanvas.current?.add(circle)
        break
      }
      case 'point': {
        const point = new fabric.Circle({
          left: pointer.x - 5,
          top: pointer.y - 5,
          radius: 5,
          fill: color,
          stroke: color,
          strokeWidth: 1
        })
        fabricCanvas.current?.add(point)
        isDrawing.current = false
        finishAnnotation('point', [pointer.x, pointer.y])
        break
      }
      case 'line': {
        const line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: color,
          strokeWidth: 2
        })
        fabricCanvas.current?.add(line)
        break
      }
      case 'polygon': {
        const polygon = new fabric.Polygon([{ x: pointer.x, y: pointer.y }], {
          fill: 'transparent',
          stroke: color,
          strokeWidth: 2
        })
        fabricCanvas.current?.add(polygon)
        break
      }
    }
  }

  const handleMouseMove = (options: fabric.IEvent) => {
    if (!isDrawing.current || tool === 'select' || tool === 'pan') return

    const pointer = fabricCanvas.current?.getPointer(options.e)
    if (!pointer) return

    const objects = fabricCanvas.current?.getObjects() || []
    const activeObject = objects[objects.length - 1]

    switch (tool) {
      case 'rectangle':
        if (activeObject instanceof fabric.Rect) {
          const width = pointer.x - currentPoints.current[0]
          const height = pointer.y - currentPoints.current[1]
          activeObject.set({
            width: Math.abs(width),
            height: Math.abs(height),
            left: width < 0 ? pointer.x : currentPoints.current[0],
            top: height < 0 ? pointer.y : currentPoints.current[1]
          })
        }
        break
      case 'circle':
        if (activeObject instanceof fabric.Circle) {
          const radius = Math.sqrt(
            Math.pow(pointer.x - currentPoints.current[0], 2) +
            Math.pow(pointer.y - currentPoints.current[1], 2)
          )
          activeObject.set({ radius })
        }
        break
      case 'line':
        if (activeObject instanceof fabric.Line) {
          activeObject.set({ x2: pointer.x, y2: pointer.y })
        }
        break
      case 'polygon':
        currentPath.current.push({ x: pointer.x, y: pointer.y })
        if (activeObject instanceof fabric.Polygon) {
          activeObject.set({ points: currentPath.current as any })
        }
        break
    }

    fabricCanvas.current?.renderAll()
  }

  const handleMouseUp = () => {
    if (!isDrawing.current) return
    isDrawing.current = false

    const objects = fabricCanvas.current?.getObjects()
    const activeObject = objects?.[objects.length - 1]

    switch (tool) {
      case 'rectangle':
        if (activeObject instanceof fabric.Rect) {
          const left = activeObject.left || 0
          const top = activeObject.top || 0
          const width = activeObject.width || 0
          const height = activeObject.height || 0
          finishAnnotation('rectangle', [left, top, left + width, top, left + width, top + height, left, top + height])
        }
        break
      case 'circle':
        if (activeObject instanceof fabric.Circle) {
          const left = activeObject.left || 0
          const top = activeObject.top || 0
          const radius = activeObject.radius || 0
          finishAnnotation('circle', [left, top, radius])
        }
        break
      case 'line':
        if (activeObject instanceof fabric.Line) {
          finishAnnotation('line', [
            activeObject.x1 || 0,
            activeObject.y1 || 0,
            activeObject.x2 || 0,
            activeObject.y2 || 0
          ])
        }
        break
      case 'polygon':
        if (activeObject instanceof fabric.Polygon) {
          const points = currentPath.current.flatMap(p => [p.x, p.y])
          finishAnnotation('polygon', points)
        }
        break
    }
  }

  const finishAnnotation = async (type: AnnotationTypeFront, points: number[]) => {
    if (!label) {
      message.warning('请先输入标注标签')
      return
    }

    const coordinates = buildCoordinates(type, points)
    const annotationTypeCode = ANNOTATION_TYPE_TO_CODE[type]

    const annotationData = {
      specimenId,
      imageId,
      annotationType: annotationTypeCode,
      label,
      confidence: confidence / 100,
      coordinates,
      color,
      note: ''
    }

    try {
      const res = await annotationApi.create(annotationData)
      dispatch(addAnnotation(res.data))
    } catch (error) {
      console.error('保存标注失败:', error)
      message.error('标注保存失败')
    }
  }

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom * 1.2, 3)
    setZoom(newZoom)
    fabricCanvas.current?.setZoom(newZoom)
  }

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom / 1.2, 0.5)
    setZoom(newZoom)
    fabricCanvas.current?.setZoom(newZoom)
  }

  const handleUndo = () => {
    dispatch(undoAnnotation())
  }

  const handleRedo = () => {
    dispatch(redoAnnotation())
  }

  const handleDeleteSelected = () => {
    if (selectedAnnotation) {
      annotationApi.delete(selectedAnnotation.id)
      dispatch(deleteAnnotation(selectedAnnotation.id))
    }
  }

  const handleClearAll = () => {
    fabricCanvas.current?.getObjects().forEach(obj => {
      if (!(obj instanceof fabric.Image)) {
        fabricCanvas.current?.remove(obj)
      }
    })
    fabricCanvas.current?.renderAll()
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Space className={styles.toolGroup}>
          <Tooltip title="选择">
            <Button
              type={tool === 'select' ? 'primary' : 'default'}
              icon={<PicCenterOutlined />}
              onClick={() => setTool('select')}
            />
          </Tooltip>
          <Tooltip title="平移">
            <Button
              type={tool === 'pan' ? 'primary' : 'default'}
              icon={<DragOutlined />}
              onClick={() => setTool('pan')}
            />
          </Tooltip>
        </Space>

        <Divider type="vertical" />

        <Space className={styles.toolGroup}>
          {ANNOTATION_TYPES.map((item) => (
            <Tooltip key={item.value} title={item.label}>
              <Button
                type={tool === item.value ? 'primary' : 'default'}
                icon={item.icon}
                onClick={() => setTool(item.value)}
              />
            </Tooltip>
          ))}
        </Space>

        <Divider type="vertical" />

        <Space className={styles.toolGroup}>
          <Input
            placeholder="标注标签"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ width: 120 }}
          />
          <ColorPicker
            value={color}
            onChange={(_value, hex) => setColor(hex)}
            presets={[{ label: '推荐色', colors: DEFAULT_COLORS }]}
          />
          <div className={styles.confidenceSlider}>
            <span>置信度:</span>
            <Slider
              value={confidence}
              onChange={setConfidence}
              min={0}
              max={100}
              style={{ width: 100 }}
            />
            <span>{confidence}%</span>
          </div>
        </Space>

        <Divider type="vertical" />

        <Space className={styles.toolGroup}>
          <Tooltip title="撤销">
            <Button
              icon={<UndoOutlined />}
              onClick={handleUndo}
              disabled={historyIndex <= 0}
            />
          </Tooltip>
          <Tooltip title="重做">
            <Button
              icon={<RedoOutlined />}
              onClick={handleRedo}
              disabled={historyIndex >= annotationHistory.length - 1}
            />
          </Tooltip>
          <Tooltip title="放大">
            <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} />
          </Tooltip>
          <Tooltip title="缩小">
            <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} />
          </Tooltip>
          <Tooltip title="删除选中">
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleDeleteSelected}
              disabled={!selectedAnnotation}
            />
          </Tooltip>
          <Popconfirm
            title="确定清空所有标注？"
            onConfirm={handleClearAll}
          >
            <Tooltip title="清空">
              <Button danger icon={<ClearOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      </div>

      <div className={styles.canvasWrapper}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>

      <div className={styles.annotationList}>
        <div className={styles.listHeader}>标注列表</div>
        <div className={styles.listContent}>
          {annotations.map((ann) => (
            <div
              key={ann.id}
              className={`${styles.annotationItem} ${
                selectedAnnotation?.id === ann.id ? styles.active : ''
              }`}
            >
              <div
                className={styles.annotationColor}
                style={{ backgroundColor: ann.color }}
              />
              <div className={styles.annotationInfo}>
                <div className={styles.annotationLabel}>{ann.label}</div>
                <div className={styles.annotationType}>
                  {ann.annotationTypeName || ANNOTATION_TYPE_MAP[ann.annotationType] || ann.annotationType}
                </div>
              </div>
              <div className={styles.annotationConfidence}>
                {Math.round((ann.confidence || 0) * 100)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CanvasAnnotator
