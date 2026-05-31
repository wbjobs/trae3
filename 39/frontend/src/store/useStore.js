import { create } from 'zustand'

const useStore = create((set, get) => ({
  devices: {},
  selectedDevice: null,
  alarms: [],
  onlineUsers: [],
  currentUser: null,
  isConnected: false,
  deviceStats: {
    total: 0,
    running: 0,
    stopped: 0,
    fault: 0
  },

  setDevices: (devices) => set({ devices }),
  
  updateDevice: (deviceId, data) => set((state) => ({
    devices: {
      ...state.devices,
      [deviceId]: {
        ...state.devices[deviceId],
        ...data,
        lastUpdate: Date.now()
      }
    }
  })),

  setSelectedDevice: (deviceId) => set({ selectedDevice: deviceId }),

  addAlarm: (alarm) => set((state) => ({
    alarms: [alarm, ...state.alarms].slice(0, 100)
  })),

  clearAlarm: (alarmId) => set((state) => ({
    alarms: state.alarms.filter(a => a.id !== alarmId)
  })),

  clearAllAlarms: () => set({ alarms: [] }),

  setOnlineUsers: (users) => set({ onlineUsers: users }),

  setCurrentUser: (user) => set({ currentUser: user }),

  setConnected: (connected) => set({ isConnected: connected }),

  updateDeviceStats: () => set((state) => {
    const devices = Object.values(state.devices)
    const total = devices.length
    const running = devices.filter(d => d.status === 'running').length
    const stopped = devices.filter(d => d.status === 'stopped').length
    const fault = devices.filter(d => d.status === 'fault').length
    return {
      deviceStats: { total, running, stopped, fault }
    }
  })
}))

export default useStore
