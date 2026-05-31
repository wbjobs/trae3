import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './Sidebar.css';

const navItems = [
  { path: '/', icon: '📊', label: '仪表盘' },
  { path: '/converter', icon: '🔄', label: '格式转换' },
  { path: '/comparator', icon: '🔍', label: '版本比对' },
  { path: '/encryption', icon: '🔐', label: '图纸加密' },
  { path: '/sync', icon: '☁️', label: '云端同步' },
  { path: '/cache', icon: '💾', label: '本地缓存' },
];

const Sidebar: React.FC = () => {
  const location = useLocation();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="logo-icon">📐</span>
          <span className="logo-text">DrawingVault</span>
        </div>
        <div className="sidebar-version">v1.0.0</div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? 'active' : ''}`
            }
            end={item.path === '/'}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-status">
          <div className="status-dot online" />
          <span>系统运行中</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
