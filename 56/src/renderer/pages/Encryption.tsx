import React, { useState, useEffect } from 'react';
import './Encryption.css';

interface EncryptionKey {
  id: string;
  name: string;
  createdAt: string;
  lastUsed?: string;
  isActive: boolean;
}

interface EncryptTask {
  id: string;
  sourcePath: string;
  outputPath?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  encryptedHash?: string;
  error?: string;
  createdAt: string;
}

const Encryption: React.FC = () => {
  const [keys, setKeys] = useState<EncryptionKey[]>([]);
  const [tasks, setTasks] = useState<EncryptTask[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [mode, setMode] = useState<'encrypt' | 'decrypt'>('encrypt');
  const [outputDir, setOutputDir] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadKeys();
    const cleanup = window.electronAPI.encrypt.onProgress(handleTaskProgress);
    return cleanup;
  }, []);

  const loadKeys = async () => {
    const result = await window.electronAPI.encrypt.listKeys();
    if (result.success && result.data) {
      setKeys(result.data as EncryptionKey[]);
    }
  };

  const handleTaskProgress = (task: EncryptTask) => {
    setTasks((prev) => {
      const index = prev.findIndex((t) => t.id === task.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = task;
        return updated;
      }
      return [...prev, task];
    });
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    const result = await window.electronAPI.encrypt.createKey(newKeyName);
    if (result.success) {
      setNewKeyName('');
      await loadKeys();
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('确定要删除此密钥吗？删除后将无法解密使用此密钥加密的文件！')) return;
    await window.electronAPI.encrypt.deleteKey(keyId);
    await loadKeys();
  };

  const handleSelectFiles = async () => {
    const result = await window.electronAPI.drawing.open();
    if (result.success && result.data) {
      setSelectedFiles(result.data as string[]);
    }
  };

  const handleBatchProcess = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);

    try {
      if (mode === 'encrypt') {
        const result = await window.electronAPI.encrypt.batch(selectedFiles, outputDir || undefined);
        if (result.success && result.data) {
          setTasks((prev) => [...prev, ...(result.data as EncryptTask[])]);
        }
      } else {
        for (const file of selectedFiles) {
          const result = await window.electronAPI.encrypt.decrypt(file);
          if (result.success && result.data) {
            setTasks((prev) => [...prev, result.data as EncryptTask]);
          }
        }
      }
      setSelectedFiles([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'badge-success';
      case 'processing':
        return 'badge-info';
      case 'failed':
        return 'badge-error';
      default:
        return 'badge-warning';
    }
  };

  return (
    <div className="encryption-page page-enter">
      <div className="page-header">
        <h1 className="page-title">图纸加密</h1>
        <p className="page-subtitle">使用 AES-256-GCM 加密算法保护您的图纸文件</p>
      </div>

      <div className="encryption-grid">
        <div className="card keys-section">
          <h2 className="section-title">密钥管理</h2>
          <div className="key-create">
            <input
              type="text"
              placeholder="输入密钥名称"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
            />
            <button className="btn btn-primary btn-sm" onClick={handleCreateKey}>
              生成密钥
            </button>
          </div>
          <div className="keys-list">
            {keys.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔐</div>
                <div className="empty-state-text">暂无密钥，请先生成加密密钥</div>
              </div>
            ) : (
              keys.map((key) => (
                <div key={key.id} className="key-item">
                  <div className="key-info">
                    <span className="key-name">
                      {key.name}
                      {key.isActive && <span className="badge badge-info">默认</span>}
                    </span>
                    <span className="key-date">
                      创建于 {new Date(key.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDeleteKey(key.id)}
                  >
                    删除
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card process-section">
          <h2 className="section-title">批量处理</h2>
          <div className="mode-switch">
            <button
              className={`mode-btn ${mode === 'encrypt' ? 'active' : ''}`}
              onClick={() => setMode('encrypt')}
            >
              加密
            </button>
            <button
              className={`mode-btn ${mode === 'decrypt' ? 'active' : ''}`}
              onClick={() => setMode('decrypt')}
            >
              解密
            </button>
          </div>

          <div className="file-selection">
            <button className="btn btn-secondary" onClick={handleSelectFiles}>
              选择文件
            </button>
            {selectedFiles.length > 0 && (
              <span className="file-count">已选择 {selectedFiles.length} 个文件</span>
            )}
          </div>

          {mode === 'encrypt' && (
            <div className="output-dir">
              <label>输出目录（可选）</label>
              <input
                type="text"
                placeholder="留空则在原目录生成"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
              />
            </div>
          )}

          <button
            className="btn btn-primary start-btn"
            onClick={handleBatchProcess}
            disabled={selectedFiles.length === 0 || isProcessing || keys.length === 0}
          >
            {isProcessing ? '处理中...' : mode === 'encrypt' ? '开始加密' : '开始解密'}
          </button>

          {keys.length === 0 && (
            <p className="hint-text">请先生成加密密钥</p>
          )}
        </div>

        <div className="card tasks-section full-width">
          <h2 className="section-title">处理任务</h2>
          <div className="tasks-list">
            {tasks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <div className="empty-state-text">暂无任务记录</div>
              </div>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="task-item">
                  <div className="task-info">
                    <span className="task-name">{task.sourcePath.split('\\').pop()}</span>
                    <span className={`badge ${getStatusColor(task.status)}`}>
                      {task.status === 'pending' ? '等待中' :
                       task.status === 'processing' ? '处理中' :
                       task.status === 'completed' ? '完成' : '失败'}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  {task.error && <span className="task-error">{task.error}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Encryption;
