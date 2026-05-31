import React from 'react';
import { useLocation } from 'react-router-dom';
import './Header.css';

const pageTitles: Record<string, string> = {
  '/': '仪表盘',
  '/converter': '格式转换',
  '/comparator': '版本比对',
  '/sync': '云端同步',
  '/cache': '本地缓存',
};

const Header: React.FC = () => {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? 'DrawingVault';

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">{title}</h1>
      </div>
      <div className="header-right">
        <div className="header-actions">
          <button className="header-action-btn" title="通知">
            🔔
          </button>
          <button className="header-action-btn" title="设置">
            ⚙️
          </button>
        </div>
        <div className="header-user">
          <div className="user-avatar">DV</div>
        </div>
      </div>
    </header>
  );
};

export default Header;
