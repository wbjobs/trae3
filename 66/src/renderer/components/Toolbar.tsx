import React from 'react';
import {
  Save,
  Plus,
  FolderPlus,
  Upload,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  HardDrive,
  FileCode,
} from 'lucide-react';
import clsx from 'clsx';
import { Project, SyncStatus } from '../../shared/types';
import { useAppStore } from '@/store/useAppStore';
import { formatFileSize, formatRelativeTime } from '../../shared/utils';

interface ToolbarProps {
  currentProject: Project | null;
  syncStatus: SyncStatus | null;
  onNewProject: () => void;
  onNewFile: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentProject,
  syncStatus,
  onNewProject,
  onNewFile,
}) => {
  const { saveProject, syncProject, pushToCloud, isLoading } = useAppStore();

  const totalSize = currentProject?.files.reduce((sum, f) => sum + f.size, 0) || 0;
  const dirtyFiles = currentProject?.files.filter((f) => f.isDirty).length || 0;

  const getSyncIcon = () => {
    if (!syncStatus || syncStatus.status === 'idle') {
      return currentProject?.isSynced ? (
        <CheckCircle size={16} className="text-green-400" />
      ) : (
        <AlertCircle size={16} className="text-yellow-400" />
      );
    }
    if (syncStatus.status === 'syncing') {
      return <RefreshCw size={16} className="text-blue-400 animate-spin" />;
    }
    if (syncStatus.status === 'success') {
      return <CheckCircle size={16} className="text-green-400" />;
    }
    return <AlertCircle size={16} className="text-red-400" />;
  };

  const getSyncText = () => {
    if (!syncStatus || syncStatus.status === 'idle') {
      return currentProject?.isSynced ? '已同步' : '未同步';
    }
    if (syncStatus.status === 'syncing') {
      return `同步中 ${syncStatus.progress}%`;
    }
    if (syncStatus.status === 'success') {
      return '同步成功';
    }
    return '同步失败';
  };

  return (
    <div className="h-12 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onNewProject}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
        >
          <FolderPlus size={16} />
          新建项目
        </button>

        {currentProject && (
          <>
            <div className="w-px h-6 bg-gray-700 mx-2" />

            <button
              onClick={onNewFile}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-sm transition-colors"
            >
              <Plus size={16} />
              新建文件
            </button>

            <button
              onClick={saveProject}
              disabled={isLoading || dirtyFiles === 0}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors',
                isLoading || dirtyFiles === 0
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              )}
            >
              <Save size={16} />
              保存
              {dirtyFiles > 0 && (
                <span className="text-xs bg-green-800 px-1.5 py-0.5 rounded">
                  {dirtyFiles}
                </span>
              )}
            </button>

            <div className="w-px h-6 bg-gray-700 mx-2" />

            <button
              onClick={syncProject}
              disabled={isLoading || !currentProject.cloudId}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors',
                isLoading || !currentProject.cloudId
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
              )}
              title={!currentProject.cloudId ? '请先上传到云端' : '同步项目'}
            >
              {getSyncIcon()}
              {getSyncText()}
            </button>

            <button
              onClick={pushToCloud}
              disabled={isLoading}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors',
                isLoading
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              )}
            >
              <Upload size={16} />
              {currentProject.cloudId ? '更新云端' : '上传云端'}
            </button>
          </>
        )}
      </div>

      {currentProject && (
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <FileCode size={12} />
            <span>{currentProject.files.length} 个文件</span>
          </div>
          <div className="flex items-center gap-1">
            <HardDrive size={12} />
            <span>{formatFileSize(totalSize)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={12} />
            <span>更新于 {formatRelativeTime(currentProject.updatedAt)}</span>
          </div>
          {currentProject.version && (
            <span className="font-mono bg-gray-800 px-2 py-0.5 rounded">
              v{currentProject.version.substring(0, 8)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
