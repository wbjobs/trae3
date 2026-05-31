import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

interface StatCard {
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
  color: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<StatCard[]>([
    { title: '转换任务', value: 0, subtitle: '今日完成', icon: '🔄', color: 'blue' },
    { title: '版本比对', value: 0, subtitle: '已完成', icon: '🔍', color: 'purple' },
    { title: '云端文件', value: 0, subtitle: '已同步', icon: '☁️', color: 'green' },
    { title: '缓存占用', value: '0 MB', subtitle: '已用空间', icon: '💾', color: 'orange' },
  ]);

  const [recentActivities, setRecentActivities] = useState([
    { id: 1, action: '图纸转换完成', detail: 'floor_plan.dwg → floor_plan.pdf', time: '2 分钟前', type: 'convert' },
    { id: 2, action: '版本比对完成', detail: 'structural_v2.dxf 对比 structural_v1.dxf，相似度 94.2%', time: '15 分钟前', type: 'compare' },
    { id: 3, action: '云端同步完成', detail: '上传 3 个文件至云端图纸库', time: '1 小时前', type: 'sync' },
    { id: 4, action: '缓存清理', detail: '释放 128 MB 过期缓存空间', time: '3 小时前', type: 'cache' },
  ]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      if (window.electronAPI) {
        const [syncRes, cacheRes] = await Promise.all([
          window.electronAPI.sync.getStatus(),
          window.electronAPI.cache.getStats(),
        ]);

        setStats([
          { title: '转换任务', value: 12, subtitle: '今日完成', icon: '🔄', color: 'blue' },
          { title: '版本比对', value: 5, subtitle: '已完成', icon: '🔍', color: 'purple' },
          {
            title: '云端文件',
            value: syncRes.success ? syncRes.data?.totalCloudFiles ?? 0 : 0,
            subtitle: '已同步',
            icon: '☁️',
            color: 'green',
          },
          {
            title: '缓存占用',
            value: cacheRes.success ? `${(cacheRes.data?.totalSize ?? 0 / 1024 / 1024).toFixed(1)} MB` : '0 MB',
            subtitle: '已用空间',
            icon: '💾',
            color: 'orange',
          },
        ]);
      }
    } catch {
      // use defaults
    }
  };

  const quickActions = [
    { label: '打开图纸', icon: '📂', action: () => window.electronAPI?.drawing.open() },
    { label: '格式转换', icon: '🔄', action: () => navigate('/converter') },
    { label: '版本比对', icon: '🔍', action: () => navigate('/comparator') },
    { label: '云端备份', icon: '☁️', action: () => navigate('/sync') },
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-stats">
        {stats.map((stat, index) => (
          <div key={index} className={`stat-card card stat-${stat.color}`}>
            <div className="stat-icon">{stat.icon}</div>
            <div className="stat-info">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-title">{stat.title}</div>
              <div className="stat-subtitle">{stat.subtitle}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-body">
        <div className="dashboard-quick-actions card">
          <h3 className="section-title">快捷操作</h3>
          <div className="quick-actions-grid">
            {quickActions.map((action, index) => (
              <button key={index} className="quick-action-btn" onClick={action.action}>
                <span className="quick-action-icon">{action.icon}</span>
                <span className="quick-action-label">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="dashboard-recent card">
          <h3 className="section-title">最近活动</h3>
          <div className="activity-list">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="activity-item">
                <div className={`activity-type-badge badge badge-${getActivityBadgeType(activity.type)}`}>
                  {getActivityLabel(activity.type)}
                </div>
                <div className="activity-content">
                  <div className="activity-action">{activity.action}</div>
                  <div className="activity-detail">{activity.detail}</div>
                </div>
                <div className="activity-time">{activity.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-formats card">
        <h3 className="section-title">支持的格式转换</h3>
        <div className="format-matrix">
          <div className="format-row">
            <span className="format-label">输入格式</span>
            <span className="format-tag">DWG</span>
            <span className="format-tag">DXF</span>
            <span className="format-tag">PDF</span>
            <span className="format-tag">SVG</span>
          </div>
          <div className="format-arrow">→</div>
          <div className="format-row">
            <span className="format-label">输出格式</span>
            <span className="format-tag output">PDF</span>
            <span className="format-tag output">SVG</span>
            <span className="format-tag output">PNG</span>
            <span className="format-tag output">JPG</span>
          </div>
        </div>
      </div>
    </div>
  );
};

function getActivityBadgeType(type: string): string {
  switch (type) {
    case 'convert': return 'info';
    case 'compare': return 'warning';
    case 'sync': return 'success';
    case 'cache': return 'error';
    default: return 'info';
  }
}

function getActivityLabel(type: string): string {
  switch (type) {
    case 'convert': return '转换';
    case 'compare': return '比对';
    case 'sync': return '同步';
    case 'cache': return '缓存';
    default: return type;
  }
}

export default Dashboard;
