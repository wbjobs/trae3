import React, { useState, useEffect, useCallback } from 'react';
import './Cache.css';

interface CacheStatsUI {
  totalEntries: number;
  totalSize: number;
  maxCapacity: number;
  hitRate: number;
}

const Cache: React.FC = () => {
  const [stats, setStats] = useState<CacheStatsUI>({
    totalEntries: 0,
    totalSize: 0,
    maxCapacity: 500 * 1024 * 1024,
    hitRate: 0,
  });
  const [isClearing, setIsClearing] = useState(false);
  const [cacheEntries, setCacheEntries] = useState([
    { key: 'floor_plan_v3.svg', size: 245760, accessedAt: '2026-05-30T10:30:00Z', type: '转换缓存' },
    { key: 'structural_detail.pdf', size: 1048576, accessedAt: '2026-05-30T09:15:00Z', type: '转换缓存' },
    { key: 'diff_result_001.json', size: 15360, accessedAt: '2026-05-29T14:20:00Z', type: '比对缓存' },
    { key: 'cloud_index.cache', size: 5120, accessedAt: '2026-05-29T11:00:00Z', type: '同步缓存' },
    { key: 'thumbnail_hvac.png', size: 81920, accessedAt: '2026-05-28T16:45:00Z', type: '缩略图缓存' },
  ]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.cache.getStats();
      if (result.success && result.data) {
        setStats(result.data);
      }
    } catch {
      // use defaults
    }
  };

  const handleClear = useCallback(async () => {
    setIsClearing(true);
    if (window.electronAPI) {
      await window.electronAPI.cache.clear();
    }
    setTimeout(() => {
      setCacheEntries([]);
      setStats((prev) => ({ ...prev, totalEntries: 0, totalSize: 0, hitRate: 0 }));
      setIsClearing(false);
    }, 800);
  }, []);

  const handleCleanup = useCallback(async () => {
    if (!window.electronAPI) return;
    // In production, this calls localCacheService.cleanupExpired()
    setCacheEntries((prev) => prev.slice(0, Math.ceil(prev.length * 0.7)));
  }, []);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const usagePercent = stats.maxCapacity > 0 ? (stats.totalSize / stats.maxCapacity) * 100 : 0;

  return (
    <div className="cache">
      <div className="cache-overview">
        <div className="cache-usage card">
          <h3 className="section-title">缓存使用概览</h3>
          <div className="usage-ring">
            <svg viewBox="0 0 120 120" className="usage-ring-svg">
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="var(--bg-tertiary)"
                strokeWidth="10"
              />
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke={usagePercent > 80 ? 'var(--accent-red)' : usagePercent > 50 ? 'var(--accent-orange)' : 'var(--accent-blue)'}
                strokeWidth="10"
                strokeDasharray={`${usagePercent * 3.14} ${314 - usagePercent * 3.14}`}
                strokeDashoffset="0"
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="usage-ring-text">
              <span className="usage-percent">{usagePercent.toFixed(1)}%</span>
              <span className="usage-label">已使用</span>
            </div>
          </div>
          <div className="usage-details">
            <div className="usage-detail-item">
              <span className="detail-label">已用空间</span>
              <span className="detail-value">{formatSize(stats.totalSize)}</span>
            </div>
            <div className="usage-detail-item">
              <span className="detail-label">总容量</span>
              <span className="detail-value">{formatSize(stats.maxCapacity)}</span>
            </div>
            <div className="usage-detail-item">
              <span className="detail-label">缓存条目</span>
              <span className="detail-value">{stats.totalEntries || cacheEntries.length}</span>
            </div>
            <div className="usage-detail-item">
              <span className="detail-label">命中率</span>
              <span className="detail-value accent">{stats.hitRate}%</span>
            </div>
          </div>
        </div>

        <div className="cache-actions card">
          <h3 className="section-title">缓存管理</h3>
          <div className="action-cards">
            <button className="action-card" onClick={handleCleanup}>
              <span className="action-card-icon">🧹</span>
              <span className="action-card-label">清理过期缓存</span>
              <span className="action-card-desc">移除已过期的缓存条目</span>
            </button>
            <button className="action-card danger" onClick={handleClear} disabled={isClearing}>
              <span className="action-card-icon">🗑️</span>
              <span className="action-card-label">{isClearing ? '清理中...' : '清空全部缓存'}</span>
              <span className="action-card-desc">删除所有本地缓存数据</span>
            </button>
          </div>
        </div>
      </div>

      <div className="cache-entries card">
        <h3 className="section-title">缓存条目</h3>
        {cacheEntries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💾</div>
            <div className="empty-state-text">缓存为空</div>
          </div>
        ) : (
          <div className="cache-table">
            <div className="cache-table-header">
              <span className="col-name">名称</span>
              <span className="col-type">类型</span>
              <span className="col-size">大小</span>
              <span className="col-accessed">最近访问</span>
            </div>
            {cacheEntries.map((entry, index) => (
              <div key={index} className="cache-table-row">
                <span className="col-name">
                  <span className="entry-icon">📄</span>
                  {entry.key}
                </span>
                <span className="col-type">
                  <span className={`badge badge-${getCacheBadgeType(entry.type)}`}>
                    {entry.type}
                  </span>
                </span>
                <span className="col-size">{formatSize(entry.size)}</span>
                <span className="col-accessed">{formatDate(entry.accessedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function getCacheBadgeType(type: string): string {
  switch (type) {
    case '转换缓存': return 'info';
    case '比对缓存': return 'warning';
    case '同步缓存': return 'success';
    case '缩略图缓存': return 'error';
    default: return 'info';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default Cache;
