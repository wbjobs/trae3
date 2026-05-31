import type { Segment } from '@/types/invoice'

interface ImageViewerProps {
  imageUrl: string
  segments: Segment[]
  activeLabel?: string
}

export default function ImageViewer({ imageUrl, segments, activeLabel }: ImageViewerProps) {
  return (
    <div className="relative w-full bg-white rounded-xl border border-indigo-100 overflow-hidden">
      <div className="relative">
        <img
          src={imageUrl}
          alt="发票图片"
          className="w-full h-auto block"
          onError={(e) => {
            const img = e.currentTarget
            img.src = ''
            img.alt = '图片加载失败'
          }}
        />
        {segments.map((seg, idx) => {
          const isActive = activeLabel === seg.label
          const [x0, y0, x1, y1] = seg.bbox
          const left = x0
          const top = y0
          const width = x1 - x0
          const height = y1 - y0
          const color = '#F5A623'
          return (
            <div
              key={idx}
              className={`absolute border-2 rounded transition-all duration-300 ${
                isActive ? 'animate-flash' : ''
              }`}
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                borderColor: color,
                backgroundColor: isActive ? color : `${color}33`,
                opacity: isActive ? 0.8 : 0.4,
              }}
            >
              {isActive && (
                <span
                  className="absolute -top-5 left-0 text-[10px] px-1.5 py-0.5 rounded text-white whitespace-nowrap font-medium"
                  style={{ backgroundColor: color }}
                >
                  {seg.label}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {segments.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-indigo-50/60">
          <p className="text-sm text-indigo-400">暂无标注信息</p>
        </div>
      )}
    </div>
  )
}
