import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppStore } from '../store/useStore.js';
import type { Node, Task, NodeMetrics, Alert, DashboardStats } from '../../shared/types.js';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { updateNode, updateTask, addNodeMetrics, addAlert, setDashboardStats, setConnected, setError } = useAppStore();

  const connect = useCallback(() => {
    try {
      const wsPort = import.meta.env.VITE_WS_PORT || '3001';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.hostname}:${wsPort}`;

      const socket = io(wsUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socket.on('connect', () => {
        console.log('WebSocket connected');
        setConnected(true);
        setError(null);
      });

      socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        setConnected(false);
      });

      socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        setConnected(false);
        setError('WebSocket连接失败，将使用静态数据');
      });

      socket.on('node:metrics', (data: { nodeId: string; metrics: NodeMetrics }) => {
        addNodeMetrics(data.nodeId, data.metrics);
      });

      socket.on('node:status', (node: Node) => {
        updateNode(node);
      });

      socket.on('task:progress', (task: Task) => {
        updateTask(task);
      });

      socket.on('task:status', (task: Task) => {
        updateTask(task);
      });

      socket.on('alert:new', (alert: Alert) => {
        addAlert(alert);
      });

      socket.on('dashboard:update', (stats: DashboardStats) => {
        setDashboardStats(stats);
      });

      socketRef.current = socket;
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      setError('WebSocket初始化失败');
    }
  }, [addNodeMetrics, addAlert, setConnected, setDashboardStats, setError, updateNode, updateTask]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
    }
  }, [setConnected]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected: useAppStore((state) => state.connected),
    connect,
    disconnect,
  };
}
