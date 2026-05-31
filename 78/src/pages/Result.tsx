import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useInvoiceStore } from '@/store/invoice'
import ImageViewer from '@/components/ImageViewer'
import FieldCard from '@/components/FieldCard'
import { ArrowLeft, FileText, Loader2, Save, CheckCircle2 } from 'lucide-react'
import { FIELD_GROUPS, FIELD_LABELS, parseConfidence, getFieldValue, getImageUrl } from '@/types/invoice'

const ALL_FIELD_KEYS = FIELD_GROUPS.flatMap((g) => g.keys)

export default function Result() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentInvoice, loading, fetchInvoice, setCurrentInvoice, updateInvoice: updateInv } = useInvoiceStore()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [activeLabel, setActiveLabel] = useState<string | undefined>()
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({})
  const [batchSaveStatus, setBatchSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    if (id) fetchInvoice(id)
    return () => setCurrentInvoice(null)
  }, [id, fetchInvoice, setCurrentInvoice])

  const handleSave = useCallback(
    (key: string, value: string) => {
      if (!currentInvoice || !id) return
      const numKeys = ['amount', 'taxAmount', 'totalAmount']
      const updateData: Record<string, unknown> = {
        [key]: numKeys.includes(key) ? (parseFloat(value) || null) : (value || null),
        verified: 1,
      }
      updateInv(id, updateData)
      setEditingKey(null)
    },
    [currentInvoice, id, updateInv],
  )

  const handleNextField = useCallback(() => {
    if (!editingKey) return
    const idx = ALL_FIELD_KEYS.indexOf(editingKey as typeof ALL_FIELD_KEYS[number])
    if (idx < ALL_FIELD_KEYS.length - 1) {
      setEditingKey(ALL_FIELD_KEYS[idx + 1] as string)
    } else {
      setEditingKey(null)
    }
  }, [editingKey])

  const handleLocalEdit = useCallback((key: string, value: string) => {
    setLocalEdits((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleBatchSave = useCallback(async () => {
    if (!currentInvoice || !id || Object.keys(localEdits).length === 0) return
    setBatchSaveStatus('saving')

    const numKeys = ['amount', 'taxAmount', 'totalAmount']
    const updateData: Record<string, unknown> = { verified: 1 }

    for (const [key, value] of Object.entries(localEdits)) {
      updateData[key] = numKeys.includes(key) ? (parseFloat(value) || null) : (value || null)
    }

    await updateInv(id, updateData)
    setLocalEdits({})
    setBatchSaveStatus('saved')
    setTimeout(() => setBatchSaveStatus('idle'), 2000)
  }, [currentInvoice, id, localEdits, updateInv])

  const hasLocalEdits = Object.keys(localEdits).length > 0

  const originalValues = useMemo(() => {
    if (!currentInvoice) return {}
    const orig: Record<string, string> = {}
    for (const key of ALL_FIELD_KEYS) {
      orig[key] = getFieldValue(currentInvoice.fields, key)
    }
    return orig
  }, [currentInvoice])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={32} className="animate-spin text-indigo-700" />
      </div>
    )
  }

  if (!currentInvoice) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-indigo-400">
        <FileText size={48} />
        <p className="text-sm">未找到票据信息</p>
        <button onClick={() => navigate('/')} className="text-sm text-amber-500 hover:underline">
          返回上传
        </button>
      </div>
    )
  }

  const inv = currentInvoice.fields
  const confidence = parseConfidence(inv.confidence)
  const imageUrl = getImageUrl(inv.id)

  return (
    <div className="p-6 h-full animate-fade-in">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-indigo-700 hover:text-amber-500 transition-colors"
        >
          <ArrowLeft size={16} />
          返回上传
        </button>
        <button
          onClick={() => navigate('/records')}
          className="text-sm text-indigo-700 hover:text-amber-500 transition-colors"
        >
          前往管理
        </button>
        <div className="flex-1" />

        {hasLocalEdits && (
          <button
            onClick={handleBatchSave}
            disabled={batchSaveStatus === 'saving'}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              batchSaveStatus === 'saved'
                ? 'bg-mint-500 text-white'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {batchSaveStatus === 'saved' ? (
              <><CheckCircle2 size={16} /> 已保存</>
            ) : batchSaveStatus === 'saving' ? (
              <><Loader2 size={16} className="animate-spin" /> 保存中...</>
            ) : (
              <><Save size={16} /> 保存修改 ({Object.keys(localEdits).length})</>
            )}
          </button>
        )}

        <span className="text-xs text-gray-400 font-mono">ID: {inv.id}</span>
      </div>

      <div className="flex gap-6 h-[calc(100vh-140px)]">
        <div className="w-[55%] flex-shrink-0 overflow-auto">
          <ImageViewer
            imageUrl={imageUrl}
            segments={currentInvoice.segments}
            activeLabel={activeLabel}
          />
        </div>

        <div className="flex-1 overflow-auto space-y-5 pr-2">
          {FIELD_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="text-xs font-semibold text-indigo-800 uppercase tracking-wider mb-2">
                {group.title}
              </h4>
              <div className="space-y-2">
                {group.keys.map((key) => {
                  const currentValue = localEdits[key] ?? getFieldValue(inv, key)
                  return (
                    <FieldCard
                      key={key}
                      label={FIELD_LABELS[key]}
                      value={currentValue}
                      confidence={confidence[key] ?? 0.5}
                      isEditing={editingKey === key}
                      onEdit={() => setEditingKey(key)}
                      onSave={(val) => {
                        handleLocalEdit(key, val)
                        handleNextField()
                      }}
                      onCancel={() => setEditingKey(null)}
                      onHover={() => setActiveLabel(FIELD_LABELS[key])}
                      onLeave={() => setActiveLabel(undefined)}
                      originalValue={originalValues[key]}
                      verified={inv.verified === 1}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
