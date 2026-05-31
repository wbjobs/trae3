import { useHistoryStore } from '../../store/useHistoryStore'
import { ARRAY_IDS, METRIC_LABELS } from '../../../shared/types'

const metricOptions = [
  { value: 'power', label: '功率' },
  { value: 'current', label: '电流' },
  { value: 'voltage', label: '电压' },
  { value: 'temperature', label: '温度' },
  { value: 'irradiance', label: '辐照度' },
]

export default function MetricSelector() {
  const query = useHistoryStore((s) => s.query)
  const setQuery = useHistoryStore((s) => s.setQuery)
  const fetchHistory = useHistoryStore((s) => s.fetchHistory)

  const toggleMetric = (metric: string) => {
    const current = query.metrics || []
    const updated = current.includes(metric)
      ? current.filter((m) => m !== metric)
      : [...current, metric]
    setQuery({ metrics: updated })
  }

  const toggleArray = (id: string) => {
    const current = query.arrayIds || []
    const updated = current.includes(id)
      ? current.filter((a) => a !== id)
      : [...current, id]
    setQuery({ arrayIds: updated })
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-4">
      <div className="space-y-3">
        <div>
          <h4 className="text-xs text-text-secondary mb-2">指标选择</h4>
          <div className="flex flex-wrap gap-2">
            {metricOptions.map((m) => (
              <label
                key={m.value}
                className={`flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded border transition-colors ${
                  query.metrics.includes(m.value)
                    ? 'border-accent/40 text-accent bg-accent/5'
                    : 'border-border-default text-text-secondary hover:text-text-primary'
                }`}
              >
                <input
                  type="checkbox"
                  checked={query.metrics.includes(m.value)}
                  onChange={() => toggleMetric(m.value)}
                  className="hidden"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs text-text-secondary mb-2">阵列选择</h4>
          <div className="flex flex-wrap gap-1.5">
            {ARRAY_IDS.map((id) => (
              <label
                key={id}
                className={`flex items-center gap-1 text-[10px] cursor-pointer px-1.5 py-0.5 rounded border transition-colors ${
                  (query.arrayIds || []).includes(id)
                    ? 'border-accent/40 text-accent bg-accent/5'
                    : 'border-border-default text-text-secondary hover:text-text-primary'
                }`}
              >
                <input
                  type="checkbox"
                  checked={(query.arrayIds || []).includes(id)}
                  onChange={() => toggleArray(id)}
                  className="hidden"
                />
                {id}
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={fetchHistory}
          className="text-xs bg-accent/10 text-accent border border-accent/30 px-4 py-1.5 rounded hover:bg-accent/20 transition-colors"
        >
          查询
        </button>
      </div>
    </div>
  )
}
