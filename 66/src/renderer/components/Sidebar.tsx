import React from 'react';
import { FolderOpen, Cloud, GitBranch, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

type PanelType = 'files' | 'cloud' | 'versions' | 'validation';

interface SidebarProps {
  activePanel: PanelType;
  onPanelChange: (panel: PanelType) => void;
  validationErrorCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePanel,
  onPanelChange,
  validationErrorCount,
}) => {
  const panels: { id: PanelType; icon: React.ReactNode; label: string }[] = [
    { id: 'files', icon: <FolderOpen size={20} />, label: '项目文件' },
    { id: 'cloud', icon: <Cloud size={20} />, label: '云端项目' },
    { id: 'versions', icon: <GitBranch size={20} />, label: '版本管理' },
    { id: 'validation', icon: <AlertCircle size={20} />, label: '语法校验' },
  ];

  return (
    <div className="w-12 bg-gray-900 flex flex-col items-center py-2 border-r border-gray-700">
      {panels.map((panel) => (
        <button
          key={panel.id}
          onClick={() => onPanelChange(panel.id)}
          className={clsx(
            'w-10 h-10 flex items-center justify-center rounded-lg mb-1 relative transition-colors',
            activePanel === panel.id
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          )}
          title={panel.label}
        >
          {panel.icon}
          {panel.id === 'validation' && validationErrorCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {validationErrorCount > 9 ? '9+' : validationErrorCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};
