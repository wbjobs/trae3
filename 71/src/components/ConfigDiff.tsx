import { useMemo } from 'react'
import { Plus, Minus, ArrowRight } from 'lucide-react'

interface ConfigDiffProps<T extends Record<string, number>> {
  oldConfig: T
  newConfig: T
  labelMap?: Partial<Record<keyof T, string>>
}

type DiffType = 'added' | 'removed' | 'modified' | 'unchanged'

interface DiffItem<T> {
  key: keyof T
  type: DiffType
  oldValue?: number
  newValue?: number
}

export function ConfigDiff<T extends Record<string, number>>({ oldConfig, newConfig, labelMap }: ConfigDiffProps<T>) {
  const diffs = useMemo((): DiffItem<T>[] => {
    const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]) as Set<keyof T>
    const result: DiffItem<T>[] = []

    allKeys.forEach((key) => {
      const oldVal = oldConfig[key]
      const newVal = newConfig[key]

      if (oldVal === undefined && newVal !== undefined) {
        result.push({ key, type: 'added', newValue: newVal })
      } else if (oldVal !== undefined && newVal === undefined) {
        result.push({ key, type: 'removed', oldValue: oldVal })
      } else if (oldVal !== newVal) {
        result.push({ key, type: 'modified', oldValue: oldVal, newValue: newVal })
      } else {
        result.push({ key, type: 'unchanged', oldValue: oldVal, newValue: newVal })
      }
    })

    return result.sort((a, b) => {
      const order: Record<DiffType, number> = { modified: 0, added: 1, removed: 2, unchanged: 3 }
      return order[a.type] - order[b.type]
    })
  }, [oldConfig, newConfig])

  const getLabel = (key: keyof T): string => {
    return labelMap?.[key] ?? String(key)
  }

  const getTypeStyles = (type: DiffType) => {
    switch (type) {
      case 'added':
        return { bg: 'bg-green-900/30', border: 'border-green-700', icon: <Plus className="w-3 h-3 text-green-400" /> }
      case 'removed':
        return { bg: 'bg-red-900/30', border: 'border-red-700', icon: <Minus className="w-3 h-3 text-red-400" /> }
      case 'modified':
        return { bg: 'bg-yellow-900/30', border: 'border-yellow-700', icon: <ArrowRight className="w-3 h-3 text-yellow-400" /> }
      default:
        return { bg: 'bg-slate-800/50', border: 'border-slate-700', icon: null }
    }
  }

  return (
    <div className="space-y-2">
      {diffs.map((diff) => {
        const styles = getTypeStyles(diff.type)
        return (
          <div
            key={String(diff.key)}
            className={`flex items-center gap-3 px-3 py-2 rounded border ${styles.bg} ${styles.border}`}
          >
            {styles.icon}
            <span className="text-sm text-slate-300 w-32">{getLabel(diff.key)}</span>
            {diff.type === 'added' && (
              <span className="text-sm text-green-400 font-mono">+ {diff.newValue}</span>
            )}
            {diff.type === 'removed' && (
              <span className="text-sm text-red-400 font-mono line-through">- {diff.oldValue}</span>
            )}
            {diff.type === 'modified' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400 font-mono line-through">{diff.oldValue}</span>
                <ArrowRight className="w-3 h-3 text-slate-500" />
                <span className="text-sm text-yellow-400 font-mono">{diff.newValue}</span>
              </div>
            )}
            {diff.type === 'unchanged' && (
              <span className="text-sm text-slate-500 font-mono">{diff.oldValue}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
