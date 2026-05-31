import { create } from "zustand";
import type {
  GameListItem,
  GameState,
  Player,
  Unit,
  HexCoord,
  Phase,
  TurnResult,
  Scenario,
  GameStateDiff,
} from "../../shared/types";

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: number;
}

interface GameStore {
  gameList: GameListItem[];
  currentGame: GameState | null;
  currentPlayer: Player | null;
  selectedUnit: Unit | null;
  movableRange: HexCoord[];
  attackableRange: HexCoord[];
  connected: boolean;
  chatMessages: ChatMessage[];
  turnResults: TurnResult[];
  currentPhase: Phase | null;
  scenarios: Scenario[];
  replayData: TurnResult[];

  setGameList: (list: GameListItem[]) => void;
  setCurrentGame: (game: GameState | null) => void;
  setCurrentPlayer: (player: Player | null) => void;
  setSelectedUnit: (unit: Unit | null) => void;
  setMovableRange: (range: HexCoord[]) => void;
  setAttackableRange: (range: HexCoord[]) => void;
  setConnected: (connected: boolean) => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;
  addTurnResult: (result: TurnResult) => void;
  setCurrentPhase: (phase: Phase | null) => void;
  setScenarios: (scenarios: Scenario[]) => void;
  setReplayData: (data: TurnResult[]) => void;
  applyStateDiff: (diff: GameStateDiff) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameList: [],
  currentGame: null,
  currentPlayer: null,
  selectedUnit: null,
  movableRange: [],
  attackableRange: [],
  connected: false,
  chatMessages: [],
  turnResults: [],
  currentPhase: null,
  scenarios: [],
  replayData: [],

  setGameList: (list) => set({ gameList: list }),
  setCurrentGame: (game) => set({ currentGame: game }),
  setCurrentPlayer: (player) => set({ currentPlayer: player }),
  setSelectedUnit: (unit) => set({ selectedUnit: unit }),
  setMovableRange: (range) => set({ movableRange: range }),
  setAttackableRange: (range) => set({ attackableRange: range }),
  setConnected: (connected) => set({ connected }),
  addChatMessage: (msg) =>
    set((state) => ({ chatMessages: [...state.chatMessages, msg] })),
  clearChat: () => set({ chatMessages: [] }),
  addTurnResult: (result) =>
    set((state) => ({ turnResults: [...state.turnResults, result] })),
  setCurrentPhase: (phase) => set({ currentPhase: phase }),
  setScenarios: (scenarios) => set({ scenarios }),
  setReplayData: (data) => set({ replayData: data }),
  applyStateDiff: (diff) =>
    set((state) => {
      if (!state.currentGame) return {};
      if (diff.id !== state.currentGame.id) return {};

      const newGame: GameState = JSON.parse(JSON.stringify(state.currentGame));

      if (diff.currentTurn !== undefined) {
        newGame.currentTurn = diff.currentTurn;
      }
      if (diff.phase !== undefined) {
        newGame.phase = diff.phase;
      }
      if (diff.status !== undefined) {
        newGame.status = diff.status;
      }

      if (diff.units) {
        for (const unitDiff of diff.units) {
          const existingUnit = newGame.units.find((u) => u.id === unitDiff.id);
          if (existingUnit) {
            Object.assign(existingUnit, unitDiff);
          }
        }
      }

      if (diff.players) {
        for (const playerDiff of diff.players) {
          const existingPlayer = newGame.players.find((p) => p.id === playerDiff.id);
          if (existingPlayer) {
            Object.assign(existingPlayer, playerDiff);
          }
        }
      }

      return { currentGame: newGame };
    }),
}));
