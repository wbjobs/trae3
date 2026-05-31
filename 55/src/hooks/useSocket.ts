import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameCommand,
  Phase,
  GameState,
  TurnResult,
} from "../../shared/types";
import { useGameStore } from "../stores/gameStore";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;

export function useSocket() {
  const socketRef = useRef<TypedSocket | null>(null);
  const gameIdRef = useRef<string | undefined>();
  const {
    setConnected,
    setCurrentGame,
    setCurrentPhase,
    addTurnResult,
    addChatMessage,
  } = useGameStore();

  useEffect(() => {
    const socket: TypedSocket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    const onConnect = () => {
      setConnected(true);
      const currentGameId = gameIdRef.current;
      if (currentGameId) {
        socket.emit("game:join", currentGameId);
      }
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onGameState = (state: GameState) => {
      setCurrentGame(state);
    };

    const onStateDiff = (diff: any) => {
      useGameStore.getState().applyStateDiff(diff);
    };

    const onPhaseChange = (phase: Phase) => {
      setCurrentPhase(phase);
    };

    const onTurnResult = (result: TurnResult) => {
      addTurnResult(result);
    };

    const onPlayerJoined = (playerId: string, playerName: string, faction: string) => {
      addChatMessage({
        id: `system-${Date.now()}`,
        senderId: "system",
        senderName: "系统",
        message: `${playerName} 加入了对局（${faction}）`,
        timestamp: Date.now(),
      });
    };

    const onPlayerLeft = (playerId: string) => {
      addChatMessage({
        id: `system-${Date.now()}`,
        senderId: "system",
        senderName: "系统",
        message: `玩家已离开对局`,
        timestamp: Date.now(),
      });
    };

    const onChatMessage = (senderId: string, senderName: string, message: string) => {
      addChatMessage({
        id: `chat-${Date.now()}-${Math.random()}`,
        senderId,
        senderName,
        message,
        timestamp: Date.now(),
      });
    };

    const onGameError = (error: { code: string; message: string }) => {
      console.error("Game error:", error.code, error.message);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("game:state", onGameState);
    socket.on("game:stateDiff", onStateDiff);
    socket.on("game:phaseChange", onPhaseChange);
    socket.on("game:turnResult", onTurnResult);
    socket.on("game:playerJoined", onPlayerJoined);
    socket.on("game:playerLeft", onPlayerLeft);
    socket.on("chat:message", onChatMessage);
    socket.on("game:error", onGameError);

    return () => {
      const currentGameId = gameIdRef.current;
      if (currentGameId) {
        socket.emit("game:leave", currentGameId);
      }
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("game:state", onGameState);
      socket.off("game:stateDiff", onStateDiff);
      socket.off("game:phaseChange", onPhaseChange);
      socket.off("game:turnResult", onTurnResult);
      socket.off("game:playerJoined", onPlayerJoined);
      socket.off("game:playerLeft", onPlayerLeft);
      socket.off("chat:message", onChatMessage);
      socket.off("game:error", onGameError);
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, []);

  const joinGame = useCallback((id: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("game:join", id);
    }
  }, []);

  const leaveGame = useCallback((id: string) => {
    socketRef.current?.emit("game:leave", id);
  }, []);

  const sendCommand = useCallback((command: GameCommand) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("game:command", command);
    }
  }, []);

  const readyGame = useCallback((id: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("game:ready", id);
    }
  }, []);

  const sendChat = useCallback((gid: string, message: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("chat:message", gid, message);
    }
  }, []);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event as any, handler);
  }, []);

  const off = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.off(event as any, handler);
  }, []);

  return {
    socket: socketRef,
    joinGame,
    leaveGame,
    sendCommand,
    readyGame,
    sendChat,
    on,
    off,
  };
}
