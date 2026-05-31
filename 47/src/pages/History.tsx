import TimeFilter from '../components/history/TimeFilter'
import MetricSelector from '../components/history/MetricSelector'
import ComparisonChart from '../components/history/ComparisonChart'
import DataTable from '../components/history/DataTable'

export default function History() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <div className="flex-1">
          <TimeFilter />
        </div>
        <div className="w-[340px]">
          <MetricSelector />
        </div>
      </div>
      <ComparisonChart />
      <DataTable />
    </div>
  )
}
