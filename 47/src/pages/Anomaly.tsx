import AnomalyTimeline from '../components/anomaly/AnomalyTimeline'
import AnomalyHeatmap from '../components/anomaly/AnomalyHeatmap'
import AnomalyDetail from '../components/anomaly/AnomalyDetail'
import { useAnomalyStore } from '../store/useAnomalyStore'

export default function Anomaly() {
  const selectedEvent = useAnomalyStore((s) => s.selectedEvent)

  return (
    <div className="flex gap-4 h-full">
      <div className="w-[60%]">
        <AnomalyTimeline />
      </div>
      <div className="w-[40%]">
        <AnomalyHeatmap />
      </div>
      {selectedEvent && <AnomalyDetail />}
    </div>
  )
}
