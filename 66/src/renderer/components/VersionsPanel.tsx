import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  Plus,
  RotateCcw,
  Calendar,
  User,
  FileCode,
  HardDrive,
  Tag,
  RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import { VersionInfo, Project } from '../../shared/types';
import { useAppStore } from '@/store/useAppStore';
import { formatRelativeTime, formatFileSize, formatDate } from '../../shared/utils';

interface VersionsPanelProps {
  versions: VersionInfo[];
  currentProject: Project | null;
}

export const VersionsPanel: React.FC<VersionsPanelProps> = ({
  versions,
  currentProject,
}) => {
  const { loadVersions, createVersion, rollbackToVersion, isLoading } = useAppStore();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  useEffect(() => {
    if (currentProject) {
      loadVersions(currentProject.id, currentProject.cloudId);
    }
  }, [currentProject?.id, currentProject?.cloudId]);

  const handleCreateVersion = async () => {
    if (!currentProject || !description.trim() || !author.trim()) return;

    await createVersion(description, author, currentProject.cloudId);
    setDescription('');
    setAuthor('');
    setShowCreateForm(false);
  };

  const handleRollback = async (version: string) => {
    if (!currentProject) return;

    const result = await window.electronAPI.dialog.showMessageBox({
      type: 'warning',
      title: '确认回滚',
      message: `确定要回滚到版本 ${version.substring(0, 12)} 吗？\n所有未保存的更改将丢失。`,
      buttons: ['取消', '回滚'],
      defaultId: 1,
    });

    if (result.response === 1) {
      await rollbackToVersion(version, currentProject.cloudId);
      setSelectedVersion(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-800 text-white">
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-purple-400" />
          <span className="font-semibold text-sm text-gray-200">版本管理</span>
        </div>
        <div className="flex items-center gap-1">
          {currentProject && (
            <>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className={clsx(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                  showCreateForm
                    ? 'bg-gray-700 text-gray-300'
                    : 'hover:bg-gray-700 text-gray-400'
                )}
                title="创建新版本"
              >
                <Plus size={14} />
                新建
              </button>
              <button
                onClick={() => currentProject && loadVersions(currentProject.id, currentProject.cloudId)}
                disabled={isLoading}
                className={clsx(
                  'p-1 rounded transition-colors',
                  isLoading
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'hover:bg-gray-700 text-gray-400'
                )}
                title="刷新版本列表"
              >
                <RefreshCw size={14} className={clsx(isLoading && 'animate-spin')} />
              </button>
            </>
          )}
        </div>
      </div>

      {showCreateForm && currentProject && (
        <div className="p-3 border-b border-gray-700 bg-gray-750 space-y-2">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="版本描述"
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="作者名称"
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateVersion}
              disabled={!description.trim() || !author.trim()}
              className={clsx(
                'flex-1 py-2 rounded text-xs transition-colors',
                !description.trim() || !author.trim()
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              )}
            >
              创建版本
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!currentProject ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
            <GitBranch size={32} className="mb-2 opacity-50" />
            <p>请先打开一个项目</p>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
            <Tag size={32} className="mb-2 opacity-50" />
            <p>暂无版本记录</p>
            <p className="text-xs mt-1">点击新建按钮创建第一个版本</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {versions.map((version, index) => {
              const isCurrent = version.version === currentProject?.version;
              const isSelected = selectedVersion === version.version;

              return (
                <div
                  key={version.version}
                  className={clsx(
                    'p-3 cursor-pointer transition-colors',
                    isSelected ? 'bg-purple-600/20' : 'hover:bg-gray-700',
                    isCurrent && 'border-l-2 border-purple-500'
                  )}
                  onClick={() => setSelectedVersion(isSelected ? null : version.version)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-purple-400">
                          {version.version.substring(0, 12)}
                        </span>
                        {isCurrent && (
                          <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded">
                            当前
                          </span>
                        )}
                        {index === 0 && (
                          <span className="text-xs bg-green-600/30 text-green-300 px-2 py-0.5 rounded">
                            最新
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-200 mt-1">{version.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <User size={10} />
                      {version.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileCode size={10} />
                      {version.fileCount} 文件
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive size={10} />
                      {formatFileSize(version.size)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={10} />
                      {formatRelativeTime(version.createdAt)}
                    </span>
                  </div>

                  {isSelected && !isCurrent && (
                    <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-gray-700/50 rounded p-2">
                          <div className="text-gray-500 mb-1">创建时间</div>
                          <div className="text-gray-300">
                            {formatDate(version.createdAt)}
                          </div>
                        </div>
                        <div className="bg-gray-700/50 rounded p-2">
                          <div className="text-gray-500 mb-1">版本号</div>
                          <div className="text-gray-300 font-mono text-xs">
                            {version.version}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRollback(version.version);
                        }}
                        disabled={isLoading}
                        className={clsx(
                          'w-full flex items-center justify-center gap-2 py-2 rounded text-xs transition-colors',
                          isLoading
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-orange-600 hover:bg-orange-700 text-white'
                        )}
                      >
                        <RotateCcw size={14} />
                        回滚到此版本
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
