import React, { useState, useCallback } from 'react';
import './Converter.css';

interface ConvertTaskUI {
  id: string;
  fileName: string;
  sourceFormat: string;
  targetFormat: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  outputPath?: string;
  error?: string;
}

const OUTPUT_FORMATS = [
  { value: 'pdf', label: 'PDF', desc: '便携文档格式' },
  { value: 'svg', label: 'SVG', desc: '矢量图形格式' },
  { value: 'png', label: 'PNG', desc: '无损位图格式' },
  { value: 'jpg', label: 'JPG', desc: '压缩位图格式' },
];

const Converter: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [targetFormat, setTargetFormat] = useState<string>('pdf');
  const [tasks, setTasks] = useState<ConvertTaskUI[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [quality, setQuality] = useState(90);
  const [dpi, setDpi] = useState(150);

  const handleOpenFiles = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.drawing.open();
      if (result.success && result.data) {
        setSelectedFiles(result.data);
      }
    } catch (err) {
      console.error('打开文件失败:', err);
    }
  }, []);

  const handleStartConvert = useCallback(async () => {
    if (selectedFiles.length === 0 || isConverting) return;
    setIsConverting(true);

    for (const filePath of selectedFiles) {
      const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

      const task: ConvertTaskUI = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 8),
        fileName,
        sourceFormat: ext,
        targetFormat,
        status: 'processing',
        progress: 0,
      };

      setTasks((prev) => [task, ...prev]);

      if (window.electronAPI) {
        try {
          const sourceFile = {
            id: task.id,
            name: fileName,
            format: ext,
            size: 0,
            path: filePath,
            hash: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const outputDir = filePath.substring(0, filePath.lastIndexOf(/[/\\]/.test(filePath) ? (filePath.includes('\\') ? '\\' : '/') : '/'));

          const result = await window.electronAPI.convert.start(
            sourceFile,
            targetFormat,
            outputDir,
            { quality, dpi }
          );

          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    status: result.success ? 'completed' : 'failed',
                    progress: result.success ? 100 : t.progress,
                    outputPath: result.data?.outputPath,
                    error: result.error,
                  }
                : t
            )
          );
        } catch (err: any) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ? { ...t, status: 'failed', error: err.message }
                : t
            )
          );
        }
      } else {
        simulateProgress(task.id);
      }
    }

    setIsConverting(false);
  }, [selectedFiles, targetFormat, quality, dpi, isConverting]);

  const simulateProgress = (taskId: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 20 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: 'completed', progress: 100 } : t
          )
        );
      } else {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, progress: Math.round(progress) } : t
          )
        );
      }
    }, 300);
  };

  const handleCancelTask = useCallback((taskId: string) => {
    if (window.electronAPI) {
      window.electronAPI.convert.cancel(taskId);
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: 'failed', error: '已取消' } : t
      )
    );
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <span className="badge badge-success">完成</span>;
      case 'processing': return <span className="badge badge-info">转换中</span>;
      case 'failed': return <span className="badge badge-error">失败</span>;
      case 'pending': return <span className="badge badge-warning">等待中</span>;
      default: return null;
    }
  };

  return (
    <div className="converter">
      <div className="converter-config card">
        <h3 className="section-title">转换配置</h3>

        <div className="config-row">
          <label className="config-label">选择文件</label>
          <div className="file-selector">
            <button className="btn btn-secondary" onClick={handleOpenFiles}>
              📂 选择图纸文件
            </button>
            {selectedFiles.length > 0 && (
              <span className="file-count">{selectedFiles.length} 个文件已选择</span>
            )}
          </div>
        </div>

        {selectedFiles.length > 0 && (
          <div className="selected-files">
            {selectedFiles.map((file, index) => (
              <div key={index} className="selected-file-item">
                <span className="file-icon">📄</span>
                <span className="file-name">{file.split(/[/\\]/).pop()}</span>
                <button
                  className="file-remove"
                  onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== index))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="config-row">
          <label className="config-label">目标格式</label>
          <div className="format-options">
            {OUTPUT_FORMATS.map((fmt) => (
              <button
                key={fmt.value}
                className={`format-option ${targetFormat === fmt.value ? 'active' : ''}`}
                onClick={() => setTargetFormat(fmt.value)}
              >
                <span className="format-option-label">{fmt.label}</span>
                <span className="format-option-desc">{fmt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="config-row-inline">
          <div className="config-field">
            <label className="config-label">质量</label>
            <input
              type="range"
              min={10}
              max={100}
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value))}
              className="range-input"
            />
            <span className="range-value">{quality}%</span>
          </div>
          <div className="config-field">
            <label className="config-label">DPI</label>
            <select value={dpi} onChange={(e) => setDpi(parseInt(e.target.value))}>
              <option value={72}>72 DPI</option>
              <option value={150}>150 DPI</option>
              <option value={300}>300 DPI</option>
              <option value={600}>600 DPI</option>
            </select>
          </div>
        </div>

        <button
          className="btn btn-primary converter-start-btn"
          onClick={handleStartConvert}
          disabled={selectedFiles.length === 0 || isConverting}
        >
          {isConverting ? '⏳ 转换中...' : '🚀 开始转换'}
        </button>
      </div>

      <div className="converter-tasks card">
        <h3 className="section-title">转换任务</h3>
        {tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔄</div>
            <div className="empty-state-text">暂无转换任务，选择文件开始转码</div>
          </div>
        ) : (
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task.id} className={`task-item task-${task.status}`}>
                <div className="task-header">
                  <span className="task-filename">{task.fileName}</span>
                  {getStatusBadge(task.status)}
                </div>
                <div className="task-detail">
                  <span className="task-format-flow">
                    {task.sourceFormat.toUpperCase()} → {task.targetFormat.toUpperCase()}
                  </span>
                </div>
                {task.status === 'processing' && (
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
                {task.status === 'completed' && task.outputPath && (
                  <div className="task-output">
                    输出: {task.outputPath}
                  </div>
                )}
                {task.status === 'failed' && task.error && (
                  <div className="task-error">{task.error}</div>
                )}
                {task.status === 'processing' && (
                  <button className="btn btn-sm btn-secondary" onClick={() => handleCancelTask(task.id)}>
                    取消
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Converter;
