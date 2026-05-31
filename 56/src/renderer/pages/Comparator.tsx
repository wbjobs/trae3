import React, { useState, useCallback } from 'react';
import './Comparator.css';

interface DiffItemUI {
  type: string;
  layer?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  description: string;
}

interface DiffResultUI {
  added: DiffItemUI[];
  removed: DiffItemUI[];
  modified: DiffItemUI[];
  summary: string;
  similarity: number;
}

interface VersionEntry {
  version: number;
  createdAt: string;
  entityCount: number;
  hash: string;
}

const Comparator: React.FC = () => {
  const [fileA, setFileA] = useState<string>('');
  const [fileB, setFileB] = useState<string>('');
  const [isComparing, setIsComparing] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResultUI | null>(null);
  const [activeTab, setActiveTab] = useState<'added' | 'removed' | 'modified'>('added');
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [selectedVersionA, setSelectedVersionA] = useState<number>(0);
  const [selectedVersionB, setSelectedVersionB] = useState<number>(0);

  const handleSelectFile = useCallback(async (which: 'A' | 'B') => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.drawing.open();
      if (result.success && result.data && result.data.length > 0) {
        if (which === 'A') setFileA(result.data[0]);
        else setFileB(result.data[0]);
      }
    } catch (err) {
      console.error('选择文件失败:', err);
    }
  }, []);

  const handleCompare = useCallback(async () => {
    if (!fileA || !fileB || isComparing) return;
    setIsComparing(true);

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.compare.start(fileA, 1, 2);
        if (result.success && result.data) {
          setDiffResult(result.data);
        }
      } else {
        setDiffResult({
          added: [
            { type: 'LINE', layer: '电气', bounds: { x: 100, y: 200, width: 50, height: 0 }, description: '新增 LINE (图层: 电气)' },
            { type: 'CIRCLE', layer: '管道', bounds: { x: 300, y: 400, width: 20, height: 20 }, description: '新增 CIRCLE (图层: 管道)' },
          ],
          removed: [
            { type: 'LINE', layer: '墙体', bounds: { x: 50, y: 80, width: 120, height: 0 }, description: '删除 LINE (图层: 墙体)' },
          ],
          modified: [
            { type: 'ARC', layer: '结构', bounds: { x: 200, y: 150, width: 80, height: 80 }, description: '修改 ARC (图层: 结构) - 位置或属性变化' },
            { type: 'LINE', layer: '标注', bounds: { x: 10, y: 20, width: 30, height: 0 }, description: '修改 LINE (图层: 标注) - 位置或属性变化' },
            { type: 'TEXT', layer: '标注', bounds: { x: 15, y: 25, width: 40, height: 10 }, description: '修改 TEXT (图层: 标注) - 位置或属性变化' },
          ],
          summary: '新增 2 个图元, 删除 1 个图元, 修改 3 个图元',
          similarity: 85.5,
        });
      }
    } catch (err) {
      console.error('比对失败:', err);
    } finally {
      setIsComparing(false);
    }
  }, [fileA, fileB, isComparing]);

  const getFileName = (path: string) => path.split(/[/\\]/).pop() ?? path;

  const currentItems = diffResult
    ? activeTab === 'added'
      ? diffResult.added
      : activeTab === 'removed'
        ? diffResult.removed
        : diffResult.modified
    : [];

  return (
    <div className="comparator">
      <div className="comparator-input card">
        <h3 className="section-title">选择比对文件</h3>

        <div className="file-pickers">
          <div className="file-picker">
            <div className="file-picker-label">
              <span className="file-picker-tag tag-a">A</span>
              <span>基准版本</span>
            </div>
            <div className="file-picker-input" onClick={() => handleSelectFile('A')}>
              {fileA ? (
                <span className="file-picker-value">{getFileName(fileA)}</span>
              ) : (
                <span className="file-picker-placeholder">点击选择图纸文件</span>
              )}
            </div>
          </div>

          <div className="file-picker-arrow">⟷</div>

          <div className="file-picker">
            <div className="file-picker-label">
              <span className="file-picker-tag tag-b">B</span>
              <span>对比版本</span>
            </div>
            <div className="file-picker-input" onClick={() => handleSelectFile('B')}>
              {fileB ? (
                <span className="file-picker-value">{getFileName(fileB)}</span>
              ) : (
                <span className="file-picker-placeholder">点击选择图纸文件</span>
              )}
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary compare-btn"
          onClick={handleCompare}
          disabled={!fileA || !fileB || isComparing}
        >
          {isComparing ? '⏳ 比对中...' : '🔍 开始比对'}
        </button>
      </div>

      {diffResult && (
        <>
          <div className="comparator-summary card">
            <div className="summary-item">
              <span className="summary-label">相似度</span>
              <div className="similarity-bar">
                <div
                  className={`similarity-fill ${diffResult.similarity > 80 ? 'high' : diffResult.similarity > 50 ? 'medium' : 'low'}`}
                  style={{ width: `${diffResult.similarity}%` }}
                />
              </div>
              <span className="summary-value">{diffResult.similarity}%</span>
            </div>
            <div className="summary-stats">
              <div className="summary-stat stat-added">
                <span className="stat-num">{diffResult.added.length}</span>
                <span className="stat-text">新增</span>
              </div>
              <div className="summary-stat stat-removed">
                <span className="stat-num">{diffResult.removed.length}</span>
                <span className="stat-text">删除</span>
              </div>
              <div className="summary-stat stat-modified">
                <span className="stat-num">{diffResult.modified.length}</span>
                <span className="stat-text">修改</span>
              </div>
            </div>
            <div className="summary-text">{diffResult.summary}</div>
          </div>

          <div className="comparator-detail card">
            <div className="detail-tabs">
              <button
                className={`detail-tab ${activeTab === 'added' ? 'active' : ''}`}
                onClick={() => setActiveTab('added')}
              >
                <span className="tab-indicator added" /> 新增 ({diffResult.added.length})
              </button>
              <button
                className={`detail-tab ${activeTab === 'removed' ? 'active' : ''}`}
                onClick={() => setActiveTab('removed')}
              >
                <span className="tab-indicator removed" /> 删除 ({diffResult.removed.length})
              </button>
              <button
                className={`detail-tab ${activeTab === 'modified' ? 'active' : ''}`}
                onClick={() => setActiveTab('modified')}
              >
                <span className="tab-indicator modified" /> 修改 ({diffResult.modified.length})
              </button>
            </div>

            <div className="detail-list">
              {currentItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">✅</div>
                  <div className="empty-state-text">无差异项</div>
                </div>
              ) : (
                currentItems.map((item, index) => (
                  <div key={index} className={`detail-item detail-${activeTab}`}>
                    <div className="detail-item-header">
                      <span className="detail-type">{item.type}</span>
                      {item.layer && <span className="detail-layer">图层: {item.layer}</span>}
                    </div>
                    <div className="detail-item-desc">{item.description}</div>
                    {item.bounds && (
                      <div className="detail-item-bounds">
                        位置: ({item.bounds.x.toFixed(1)}, {item.bounds.y.toFixed(1)}) 
                        尺寸: {item.bounds.width.toFixed(1)} × {item.bounds.height.toFixed(1)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {!diffResult && (
        <div className="comparator-placeholder card">
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-text">选择两个图纸文件进行版本比对</div>
            <div className="compare-hint">支持 DWG、DXF、PDF、SVG 格式的差异分析</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Comparator;
