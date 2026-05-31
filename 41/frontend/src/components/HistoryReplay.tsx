import { useState, useEffect, useCallback, useRef } from 'react';
import { useMonitorStore } from '../store/monitorStore';
import type { MetricPoint } from '../types';

interface HistoryReplayProps {
  onReplayData?: (point: MetricPoint) => void;
}

export function HistoryReplay({ onReplayData }: HistoryReplayProps) {
  const {
    nodes,
    selectedNodeId,
    isHistoryMode,
    history,
    historyCursor,
    setHistoryMode,
    setHistoryCursor,
    fetchNodeHistoryMetrics,
    fetchHistorySummary,
    historySummary,
  } = useMonitorStore();

  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedNode = selectedNodeId ? nodes.find(n => n.node_id === selectedNodeId) : null;
  const nodeHistoryData = selectedNodeId ? history[selectedNodeId] || [] : [];
  const maxCursor = Math.max(0, nodeHistoryData.length - 1);
  const currentPoint = nodeHistoryData[historyCursor];

  useEffect(() => {
    if (isHistoryMode) {
      fetchHistorySummary(24);
    }
  }, [isHistoryMode, fetchHistorySummary]);

  const getTimeRangeHours = (range: '1h' | '6h' | '24h' | '7d'): number => {
    switch (range) {
      case '1h': return 1;
      case '6h': return 6;
      case '24h': return 24;
      case '7d': return 168;
    }
  };

  const handleStartReplay = useCallback(async () => {
    if (!selectedNodeId) {
      alert('请先选择一个节点');
      return;
    }

    const hours = getTimeRangeHours(timeRange);
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);

    await fetchNodeHistoryMetrics(selectedNodeId, start.toISOString(), end.toISOString());
    setHistoryCursor(0);
    setIsPlaying(true);
  }, [selectedNodeId, timeRange, fetchNodeHistoryMetrics, setHistoryCursor]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleReset = useCallback(() => {
    setHistoryCursor(0);
    setIsPlaying(false);
  }, [setHistoryCursor]);

  const handleStop = useCallback(() => {
    setHistoryMode(false);
    setHistoryCursor(0);
    setIsPlaying(false);
  }, [setHistoryMode, setHistoryCursor]);

  useEffect(() => {
    if (isPlaying && nodeHistoryData.length > 0) {
      intervalRef.current = setInterval(() => {
        const state = useMonitorStore.getState();
        const current = state.historyCursor;
        if (current >= maxCursor) {
          setIsPlaying(false);
        } else {
          setHistoryCursor(current + 1);
        }
      }, 500 / playbackSpeed);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, maxCursor, playbackSpeed, setHistoryCursor]);

  useEffect(() => {
    if (currentPoint && onReplayData) {
      onReplayData(currentPoint);
    }
  }, [currentPoint, onReplayData]);

  const formatTime = (iso: string | undefined) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHistoryCursor(parseInt(e.target.value, 10));
  };

  const progress = maxCursor > 0 ? (historyCursor / maxCursor) * 100 : 0;

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <span>⏱️</span>
          历史回放
        </h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-slate-400">启用回放</span>
          <input
            type="checkbox"
            checked={isHistoryMode}
            onChange={e => setHistoryMode(e.target.checked)}
            className="w-4 h-4 rounded"
          />
        </label>
      </div>

      {isHistoryMode && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-slate-400 mb-1">选择节点</label>
              <select
                value={selectedNodeId || ''}
                onChange={e => {
                  const nodeId = e.target.value || null;
                  if (nodeId) {
                    useMonitorStore.getState().setSelectedNode(nodeId);
                  }
                }}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200"
              >
                <option value="">请选择节点...</option>
                {nodes.map(node => (
                  <option key={node.node_id} value={node.node_id}>
                    {node.node_name} ({node.node_id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">时间范围</label>
              <div className="flex gap-1">
                {(['1h', '6h', '24h', '7d'] as const).map(range => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-3 py-2 text-sm rounded transition-colors ${
                      timeRange === range
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">播放速度</label>
              <select
                value={playbackSpeed}
                onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
                className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200"
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={5}>5x</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                onClick={handleStartReplay}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm transition-colors"
              >
                加载数据
              </button>
              <button
                onClick={handlePlayPause}
                disabled={nodeHistoryData.length === 0}
                className={`px-4 py-2 rounded text-sm transition-colors ${
                  nodeHistoryData.length === 0
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {isPlaying ? '⏸️ 暂停' : '▶️ 播放'}
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm transition-colors"
              >
                ⏮️ 重置
              </button>
              <button
                onClick={handleStop}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-sm transition-colors"
              >
                ⏹️ 退出
              </button>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>回放进度: {historyCursor}/{maxCursor}</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max={maxCursor}
              value={historyCursor}
              onChange={handleProgressChange}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          {selectedNode && (
            <div className="bg-slate-700/50 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-200 font-medium">
                    {selectedNode.node_name}
                    <span className="text-slate-400 ml-2">({selectedNode.node_id})</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    数据点: {nodeHistoryData.length}
                  </p>
                </div>
                {currentPoint && (
                  <div className="text-right">
                    <p className="text-xs text-slate-400">
                      {formatTime(currentPoint.timestamp)}
                    </p>
                    <div className="flex gap-3 text-sm">
                      <span className="text-blue-400">CPU: {currentPoint.cpu_usage.toFixed(1)}%</span>
                      <span className="text-emerald-400">MEM: {currentPoint.memory_usage.toFixed(1)}%</span>
                      <span className="text-amber-400">DISK: {currentPoint.disk_usage.toFixed(1)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {historySummary && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="bg-slate-700/30 rounded p-2 text-center">
                <p className="text-xl font-bold text-purple-400">{historySummary.total_status_changes}</p>
                <p className="text-xs text-slate-400">状态变更次数</p>
              </div>
              <div className="bg-slate-700/30 rounded p-2 text-center">
                <p className="text-xl font-bold text-blue-400">{historySummary.total_metrics}</p>
                <p className="text-xs text-slate-400">历史指标数</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
