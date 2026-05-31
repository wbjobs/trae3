import { useHistoryStore } from '../../store/useHistoryStore'

const quickRanges = [
  { label: '近1小时', hours: 1 },
  { label: '今日', hours: 24 },
  { label: '近7天', hours: 168 },
]

const intervals = [
  { value: '1m', label: '1分钟' },
  { value: '5m', label: '5分钟' },
  { value: '15m', label: '15分钟' },
  { value: '1h', label: '1小时' },
] as const

export default function TimeFilter() {
  const query = useHistoryStore((s) => s.query)
  const setQuery = useHistoryStore((s) => s.setQuery)

  const setQuickRange = (hours: number) => {
    const end = new Date()
    const start = new Date(end.getTime() - hours * 3600 * 1000)
    setQuery({
      start: start.toISOString(),
      end: end.toISOString(),
    })
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {quickRanges.map((r) => (
            <button
              key={r.label}
              onClick={() => setQuickRange(r.hours)}
              className="text-xs px-3 py-1.5 rounded border border-border-default text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
            >
              {r.label}
            </button>
          ))}
          <button
            className="text-xs px-3 py-1.5 rounded border border-border-default text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
            onClick={() => {
              const end = new Date()
              const start = new Date(end.getTime() - 3600 * 1000)
              setQuery({ start: start.toISOString(), end: end.toISOString() })
            }}
          >
            自定义
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="datetime-local"
            value={query.start ? query.start.slice(0, 16) : ''}
            onChange={(e) => setQuery({ start: new Date(e.target.value).toISOString() })}
            className="bg-bg-primary border border-border-default rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
          />
          <span>至</span>
          <input
            type="datetime-local"
            value={query.end ? query.end.slice(0, 16) : ''}
            onChange={(e) => setQuery({ end: new Date(e.target.value).toISOString() })}
            className="bg-bg-primary border border-border-default rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-text-secondary">间隔:</span>
          <select
            value={query.interval || '5m'}
            onChange={(e) => setQuery({ interval: e.target.value as any })}
            className="bg-bg-primary border border-border-default rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
          >
            {intervals.map((iv) => (
              <option key={iv.value} value={iv.value}>
                {iv.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
