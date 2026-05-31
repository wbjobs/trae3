import { useState, useEffect } from 'react'
import { Check, X, Pencil, RotateCcw } from 'lucide-react'

interface FieldCardProps {
  label: string
  value: string
  confidence: number
  isEditing?: boolean
  onEdit?: () => void
  onSave?: (value: string) => void
  onCancel?: () => void
  onHover?: () => void
  onLeave?: () => void
  originalValue?: string
  verified?: boolean
}

export default function FieldCard({
  label,
  value,
  confidence,
  isEditing = false,
  onEdit,
  onSave,
  onCancel,
  onHover,
  onLeave,
  originalValue,
  verified = false,
}: FieldCardProps) {
  const [editValue, setEditValue] = useState(value)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setEditValue(value)
  }, [value])

  const lowConfidence = confidence < 0.7
  const pct = Math.round(confidence * 100)
  const isModified = originalValue !== undefined && originalValue !== value

  const handleSave = () => {
    if (editValue === value) {
      onCancel?.()
      return
    }
    onSave?.(editValue)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const handleCancel = () => {
    setEditValue(value)
    onCancel?.()
  }

  const handleReset = () => {
    if (originalValue !== undefined) {
      setEditValue(originalValue)
      onSave?.(originalValue)
    }
  }

  const confidenceColor =
    confidence >= 0.9 ? 'text-mint-500 bg-mint-100' :
    confidence >= 0.7 ? 'text-amber-600 bg-amber-100' :
    'text-coral-500 bg-coral-100'

  const barColor =
    confidence >= 0.9 ? 'bg-mint-500' :
    confidence >= 0.7 ? 'bg-amber-500' :
    'bg-coral-500'

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`rounded-lg p-3 bg-white border transition-all duration-200 card-hover group ${
        lowConfidence
          ? 'border-l-4 border-l-amber-500 bg-amber-500/5 border-t-indigo-100 border-r-indigo-100 border-b-indigo-100'
          : isModified
          ? 'border-l-4 border-l-mint-500 border-t-indigo-100 border-r-indigo-100 border-b-indigo-100'
          : 'border-indigo-100'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-indigo-800">{label}</span>
          {verified && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-mint-100 text-mint-500 font-medium">
              已核验
            </span>
          )}
          {isModified && !verified && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-500 font-medium">
              已修改
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isModified && originalValue !== undefined && !isEditing && (
            <button
              onClick={handleReset}
              className="p-0.5 rounded hover:bg-indigo-50 transition-colors"
              title="恢复原始值"
            >
              <RotateCcw size={11} className="text-indigo-400" />
            </button>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium ${confidenceColor}`}>
            {pct}%
          </span>
        </div>
      </div>

      <div className="confidence-bar mb-2">
        <div className={`confidence-bar-fill ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="flex-1 text-sm px-2 py-1.5 border border-amber-400 rounded font-mono focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 bg-amber-50/50"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') handleCancel()
              if (e.key === 'Tab') {
                e.preventDefault()
                handleSave()
              }
            }}
          />
          <button onClick={handleSave} className="p-1.5 rounded-md bg-mint-500/10 hover:bg-mint-500/20 transition-colors" title="保存 (Enter)">
            <Check size={16} className="text-mint-500" />
          </button>
          <button onClick={handleCancel} className="p-1.5 rounded-md bg-coral-500/10 hover:bg-coral-500/20 transition-colors" title="取消 (Esc)">
            <X size={16} className="text-coral-500" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span
            onClick={onEdit}
            className={`flex-1 text-sm font-mono cursor-pointer hover:text-indigo-800 transition-colors ${
              value ? 'text-gray-800' : 'text-gray-400 italic'
            }`}
          >
            {value || '点击填写'}
          </span>
          {saved ? (
            <Check size={14} className="text-mint-500 animate-fade-in" />
          ) : (
            <button
              onClick={onEdit}
              className="p-1 rounded hover:bg-indigo-50 transition-colors opacity-0 group-hover:opacity-100"
              title="编辑"
            >
              <Pencil size={13} className="text-indigo-400" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
