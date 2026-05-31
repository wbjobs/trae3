import React, { useState, useEffect, useCallback } from 'react';
import './Sync.css';

interface SyncTaskUI {
  id: string;
  type: 'upload' | 'download';
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

interface CloudDrawingUI {
  id: string;
  name: string;
  format: string;
  size: number;
  version: number;
  updatedAt: string;
}

const Sync: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [cloudFiles, setCloudFiles] = useState<CloudDrawingUI[]>([]);
  const [tasks, setTasks] = useState<SyncTaskUI[]>([]);
  const [stats, setStats] = useState({
    totalCloudFiles: 0,
    pendingUploads: 0,
    pendingDownloads: 0,
  });

  useEffect(() => {
    loadSyncStatus();
  }, []);

  const loadSyncStatus = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.sync.getStatus();
      if (result.success) {
        setIsSyncing(result.data?.isSyncing ?? false);
        setLastSyncTime(result.data?.lastSyncTime ?? null);
        setStats({
          totalCloudFiles: result.data?.totalCloudFiles ?? 0,
          pendingUploads: result.data?.pendingUploads ?? 0,
          pendingDownloads: result.data?.pendingDownloads ?? 0,
        });
      }
    } catch {
      // ignore
    }
  };

  const handleAuth = useCallback(async () => {
    if (!apiKey || !apiSecret) return;
    // In production, this would call cloudSyncService.authenticate
    setIsAuthenticated(true);
  }, [apiKey, apiSecret]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    // In production, this would trigger actual sync
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncTime(new Date().toISOString());
      setCloudFiles([
        { id: '1', name: 'floor_plan_v3.dwg', format: 'dwg', size: 2048000, version: 3, updatedAt: '2026-05-30T10:30:00Z' },
        { id: '2', name: 'structural_detail.dxf', format: 'dxf', size: 1024000, version: 1, updatedAt: '2026-05-29T14:20:00Z' },
        { id: '3', name: 'hvac_layout.pdf', format: 'pdf', size: 5120000, version: 2, updatedAt: '2026-05-28T09:15:00Z' },
        { id: '4', name: 'electrical_schema.svg', format: 'svg', size: 256000, version: 1, updatedAt: '2026-05-27T16:45:00Z' },
        { id: '5', name: 'plumbing_diagram.dwg', format: 'dwg', size: 3072000, version: 5, updatedAt: '2026-05-26T11:00:00Z' },
      ]);
    }, 2000);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.drawing.open();
      if (result.success && result.data) {
        for (const filePath of result.data) {
          const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
          const task: SyncTaskUI = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 8),
            type: 'upload',
            fileName,
            status: 'processing',
            progress: 0,
          };
          setTasks((prev) => [task, ...prev]);
          simulateTaskProgress(task.id);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const handleDownload = useCallback((file: CloudDrawingUI) => {
    const task: SyncTaskUI = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 8),
      type: 'download',
      fileName: file.name,
      status: 'processing',
      progress: 0,
    };
    setTasks((prev) => [task, ...prev]);
    simulateTaskProgress(task.id);
  }, []);

  const simulateTaskProgress = (taskId: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 25 + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: 'completed', progress: 100 } : t))
        );
      } else {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, progress: Math.round(progress) } : t))
        );
      }
    }, 400);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (!isAuthenticated) {
    return (
      <div className="sync">
        <div className="sync-auth card">
          <div className="auth-header">
            <span className="auth-icon">☁️</span>
            <h3 className="section-title">连接云端图纸库</h3>
            <p className="auth-desc">输入 API 凭证以连接到云端图纸库，实现图纸的云端备份与同步</p>
          </div>
          <div className="auth-form">
            <div className="auth-field">
              <label className="config-label">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入 API Key"
              />
            </div>
            <div className="auth-field">
              <label className="config-label">API Secret</label>
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="输入 API Secret"
              />
            </div>
            <button className="btn btn-primary auth-btn" onClick={handleAuth} disabled={!apiKey || !apiSecret}>
              🔐 连接云端
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sync">
      <div className="sync-toolbar card">
        <div className="sync-status-row">
          <div className="sync-status-indicator">
            <div className="status-dot online" />
            <span className="sync-status-text">已连接</span>
          </div>
          <div className="sync-stats-mini">
            <span className="sync-stat-item">云端: {stats.totalCloudFiles} 文件</span>
            <span className="sync-stat-divider">|</span>
            <span className="sync-stat-item">上次同步: {lastSyncTime ? formatDate(lastSyncTime) : '从未'}</span>
          </div>
          <div className="sync-actions">
            <button className="btn btn-primary btn-sm" onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? '⏳ 同步中...' : '🔄 立即同步'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleUpload}>
              ⬆️ 上传图纸
            </button>
          </div>
        </div>
      </div>

      <div className="sync-content">
        <div className="sync-cloud card">
          <h3 className="section-title">云端图纸库</h3>
          {cloudFiles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">☁️</div>
              <div className="empty-state-text">点击"立即同步"获取云端图纸列表</div>
            </div>
          ) : (
            <div className="cloud-file-list">
              {cloudFiles.map((file) => (
                <div key={file.id} className="cloud-file-item">
                  <div className="cloud-file-info">
                    <span className="cloud-file-icon">
                      {file.format === 'dwg' ? '📐' : file.format === 'dxf' ? '📏' : file.format === 'pdf' ? '📄' : '🖼️'}
                    </span>
                    <div className="cloud-file-meta">
                      <span className="cloud-file-name">{file.name}</span>
                      <span className="cloud-file-detail">
                        {formatFileSize(file.size)} · V{file.version} · {formatDate(file.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleDownload(file)}>
                    ⬇️ 下载
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sync-tasks card">
          <h3 className="section-title">同步任务</h3>
          {tasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-text">暂无同步任务</div>
            </div>
          ) : (
            <div className="sync-task-list">
              {tasks.map((task) => (
                <div key={task.id} className={`sync-task-item sync-task-${task.status}`}>
                  <div className="sync-task-header">
                    <span className="sync-task-type">
                      {task.type === 'upload' ? '⬆️ 上传' : '⬇️ 下载'}
                    </span>
                    <span className="sync-task-filename">{task.fileName}</span>
                    <span className={`badge badge-${task.status === 'completed' ? 'success' : task.status === 'failed' ? 'error' : 'info'}`}>
                      {task.status === 'completed' ? '完成' : task.status === 'failed' ? '失败' : '进行中'}
                    </span>
                  </div>
                  {task.status === 'processing' && (
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${task.progress}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sync;
