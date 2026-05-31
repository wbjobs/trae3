import { create } from 'zustand'
import type { Room, GameState, UnitCommand, LogEntry, UnitState, MapConfig } from '@shared/types'

interface GameStore {
  rooms: Room[]
  currentRoom: Room | null
  gameState: GameState | null
  mapConfig: MapConfig | null
  selectedUnit: UnitState | null
  commands: UnitCommand[]
  logs: LogEntry[]
  connected: boolean
  playerId: string | null
  playerFaction: 'red' | 'blue' | 'none'

  setRooms: (rooms: Room[]) => void
  joinRoom: (room: Room, playerId: string, faction: 'red' | 'blue' | 'none') => void
  leaveRoom: () => void
  setGameState: (state: GameState) => void
  setMapConfig: (config: MapConfig) => void
  setSelectedUnit: (unit: UnitState | null) => void
  addCommand: (command: UnitCommand) => void
  removeCommand: (unitId: string) => void
  submitCommands: () => UnitCommand[]
  addLog: (entry: LogEntry) => void
  setConnected: (connected: boolean) => void
  updateRoom: (room: Room) => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  rooms: [],
  currentRoom: null,
  gameState: null,
  mapConfig: null,
  selectedUnit: null,
  commands: [],
  logs: [],
  connected: false,
  playerId: null,
  playerFaction: 'none',

  setRooms: (rooms) => set({ rooms }),

  joinRoom: (room, playerId, faction) => set({
    currentRoom: room,
    playerId,
    playerFaction: faction,
  }),

  leaveRoom: () => set({
    currentRoom: null,
    gameState: null,
    mapConfig: null,
    selectedUnit: null,
    commands: [],
    logs: [],
    playerId: null,
    playerFaction: 'none',
  }),

  setGameState: (state) => set({ gameState: state }),

  setMapConfig: (config) => set({ mapConfig: config }),

  setSelectedUnit: (unit) => set({ selectedUnit: unit }),

  addCommand: (command) => set((s) => {
    const filtered = s.commands.filter((c) => c.unitId !== command.unitId)
    return { commands: [...filtered, command] }
  }),

  removeCommand: (unitId) => set((s) => ({
    commands: s.commands.filter((c) => c.unitId !== unitId),
  })),

  submitCommands: () => {
    const { commands } = get()
    set({ commands: [] })
    return commands
  },

  addLog: (entry) => set((s) => ({
    logs: [...s.logs.slice(-99), entry],
  })),

  setConnected: (connected) => set({ connected }),

  updateRoom: (room) => set((s) => {
    if (s.currentRoom?.roomId === room.roomId) {
      return { currentRoom: room }
    }
    return {
      rooms: s.rooms.map((r) => r.roomId === room.roomId ? room : r),
    }
  }),
}))
