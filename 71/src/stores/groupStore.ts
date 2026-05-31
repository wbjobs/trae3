import { create } from 'zustand'
import type { DeviceGroup, Device } from '../../shared/types'

const COLORS = [
  '#06B6D4',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
]

interface GroupStore {
  groups: DeviceGroup[]
  loading: boolean
  selectedGroupId: string | null
  fetchGroups: () => Promise<void>
  createGroup: (name: string, description?: string) => Promise<boolean>
  deleteGroup: (id: string) => Promise<boolean>
  addDeviceToGroup: (groupId: string, deviceId: string) => Promise<boolean>
  removeDeviceFromGroup: (groupId: string, deviceId: string) => Promise<boolean>
  setSelectedGroup: (id: string | null) => void
  getGroupDevices: (groupId: string | null, devices: Device[]) => Device[]
}

export const useGroupStore = create<GroupStore>((set, get) => ({
  groups: [],
  loading: false,
  selectedGroupId: null,

  fetchGroups: async () => {
    set({ loading: true })
    try {
      const res = await fetch('/api/groups')
      const data = await res.json()
      set({ groups: data.groups || [], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createGroup: async (name, description = '') => {
    try {
      const color = COLORS[get().groups.length % COLORS.length]
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, color }),
      })
      if (res.ok) {
        await get().fetchGroups()
        return true
      }
    } catch {}
    return false
  },

  deleteGroup: async (id) => {
    try {
      const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' })
      if (res.ok) {
        if (get().selectedGroupId === id) {
          set({ selectedGroupId: null })
        }
        await get().fetchGroups()
        return true
      }
    } catch {}
    return false
  },

  addDeviceToGroup: async (groupId, deviceId) => {
    try {
      const res = await fetch(`/api/groups/${groupId}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      })
      if (res.ok) {
        await get().fetchGroups()
        return true
      }
    } catch {}
    return false
  },

  removeDeviceFromGroup: async (groupId, deviceId) => {
    try {
      const res = await fetch(`/api/groups/${groupId}/devices/${deviceId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await get().fetchGroups()
        return true
      }
    } catch {}
    return false
  },

  setSelectedGroup: (id) => set({ selectedGroupId: id }),

  getGroupDevices: (groupId, devices) => {
    if (!groupId) return devices
    return devices.filter(d => d.groupIds?.includes(groupId))
  },
}))
