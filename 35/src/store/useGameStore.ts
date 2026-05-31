import { create } from 'zustand';
import type { GameState, Entity, Player, ChatMessage, Room } from '../../shared/types';

interface GameStore {
  playerId: string;
  nickname: string;
  currentRoom: Room | null;
  gameState: GameState | null;
  selectedEntityId: string | null;
  chatMessages: ChatMessage[];
  isConnected: boolean;
  isInGame: boolean;
  gameOver: boolean;
  winner: string | null;

  setPlayer: (id: string, nickname: string) => void;
  setCurrentRoom: (room: Room | null) => void;
  setGameState: (state: GameState) => void;
  setSelectedEntityId: (id: string | null) => void;
  addChatMessage: (message: ChatMessage) => void;
  setConnected: (connected: boolean) => void;
  setInGame: (inGame: boolean) => void;
  setGameOver: (over: boolean, winner?: string) => void;
  reset: () => void;
  getPlayerEntities: () => Entity[];
  getSelectedEntity: () => Entity | null;
}

export const useGameStore = create<GameStore>((set, get) => ({
  playerId: '',
  nickname: '',
  currentRoom: null,
  gameState: null,
  selectedEntityId: null,
  chatMessages: [],
  isConnected: false,
  isInGame: false,
  gameOver: false,
  winner: null,

  setPlayer: (id, nickname) => set({ playerId: id, nickname }),

  setCurrentRoom: (room) => set({ currentRoom: room }),

  setGameState: (state) => set({ gameState: state }),

  setSelectedEntityId: (id) => set({ selectedEntityId: id }),

  addChatMessage: (message) => set((state) => ({
    chatMessages: [...state.chatMessages.slice(-50), message]
  })),

  setConnected: (connected) => set({ isConnected: connected }),

  setInGame: (inGame) => set({ isInGame: inGame }),

  setGameOver: (over, winner) => set({ gameOver: over, winner: winner || null }),

  reset: () => set({
    currentRoom: null,
    gameState: null,
    selectedEntityId: null,
    chatMessages: [],
    isInGame: false,
    gameOver: false,
    winner: null
  }),

  getPlayerEntities: () => {
    const { gameState, playerId } = get();
    if (!gameState) return [];
    return gameState.entities.filter(e => e.ownerId === playerId && e.state !== 'dead');
  },

  getSelectedEntity: () => {
    const { gameState, selectedEntityId } = get();
    if (!gameState || !selectedEntityId) return null;
    return gameState.entities.find(e => e.id === selectedEntityId) || null;
  }
}));
