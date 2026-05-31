import KpiCards from '../components/dashboard/KpiCards'
import PowerChart from '../components/dashboard/PowerChart'
import IVChart from '../components/dashboard/IVChart'
import IrradianceChart from '../components/dashboard/IrradianceChart'
import DevicePanel from '../components/dashboard/DevicePanel'
import ForecastPanel from '../components/dashboard/ForecastPanel'

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-4">
      <KpiCards />
      <div className="grid grid-cols-2 gap-4">
        <PowerChart />
        <IVChart />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <IrradianceChart />
        <DevicePanel />
        <ForecastPanel />
      </div>
    </div>
  )
}
