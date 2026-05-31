import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import PipelineScene from '@/components/scene/PipelineScene'
import SceneOverlay from '@/components/scene/SceneOverlay'
import { useDeviceStore } from '@/stores/deviceStore'

export default function ScenePage() {
  const location = useLocation()
  const fetchDevices = useDeviceStore((s) => s.fetchDevices)
  const setSelectedDevice = useDeviceStore((s) => s.setSelectedDevice)
  const devices = useDeviceStore((s) => s.devices)

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  useEffect(() => {
    const state = location.state as { deviceId?: string } | null
    if (state?.deviceId && devices.length > 0) {
      const device = devices.find((d) => d.id === state.deviceId)
      if (device) {
        setSelectedDevice(device)
      }
    }
  }, [location.state, devices, setSelectedDevice])

  return (
    <div className="w-full h-full relative">
      <PipelineScene />
      <SceneOverlay />
    </div>
  )
}
