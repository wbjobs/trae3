import React, { useState } from 'react';
import {
  Cloud,
  Upload,
  Download,
  RefreshCw,
  Globe,
  Lock,
  Clock,
  User,
  FileCode,
  HardDrive,
} from 'lucide-react';
import clsx from 'clsx';
import { CloudProject, Project } from '../../shared/types';
import { useAppStore } from '@/store/useAppStore';
import { formatRelativeTime, formatFileSize } from '../../shared/utils';

interface CloudPanelProps {
  projects: CloudProject[];
  currentProject: Project | null;
  onPull: (cloudId: string) => void;
}

export const CloudPanel: React.FC<CloudPanelProps> = ({
  projects,
  currentProject,
  onPull,
}) => {
  const { loadCloudProjects, isLoading, pushToCloud } = useAppStore();
  const [selectedCloudId, setSelectedCloudId] = useState<string | null>(null);

  const handlePush = async () => {
    if (!currentProject) return;
    await pushToCloud();
    await loadCloudProjects();
  };

  return (
    <div className="h-full flex flex-col bg-gray-800 text-white">
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Cloud size={16} className="text-blue-400" />
          <span className="font-semibold text-sm text-gray-200">云端项目</span>
        </div>
        <div className="flex items-center gap-1">
          {currentProject && (
            <button
              onClick={handlePush}
              disabled={isLoading}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                isLoading
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              )}
              title="上传当前项目到云端"
            >
              <Upload size={12} />
              上传
            </button>
          )}
          <button
            onClick={loadCloudProjects}
            disabled={isLoading}
            className={clsx(
              'p-1 rounded transition-colors',
              isLoading
                ? 'text-gray-600 cursor-not-allowed'
                : 'hover:bg-gray-700 text-gray-400'
            )}
            title="刷新列表"
          >
            <RefreshCw size={14} className={clsx(isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
            <Cloud size={32} className="mb-2 opacity-50" />
            <p>暂无云端项目</p>
            <p className="text-xs mt-1">点击刷新按钮获取列表</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {projects.map((project) => {
              const isSynced = currentProject?.cloudId === project.id;
              const isSelected = selectedCloudId === project.id;

              return (
                <div
                  key={project.id}
                  className={clsx(
                    'p-3 cursor-pointer transition-colors',
                    isSelected ? 'bg-blue-600/20' : 'hover:bg-gray-700',
                    isSynced && 'border-l-2 border-green-500'
                  )}
                  onClick={() => setSelectedCloudId(isSelected ? null : project.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-200 truncate">
                          {project.name}
                        </span>
                        {project.isPublic ? (
                          <Globe size={12} className="text-green-400" title="公开" />
                        ) : (
                          <Lock size={12} className="text-yellow-400" title="私有" />
                        )}
                        {isSynced && (
                          <span className="text-xs text-green-400">已同步</span>
                        )}
                      </div>
                      {project.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <User size={10} />
                      {project.owner}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileCode size={10} />
                      {project.versions.length} 版本
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatRelativeTime(project.updatedAt)}
                    </span>
                  </div>

                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-gray-700/50 rounded p-2">
                          <div className="text-gray-500 mb-1">创建时间</div>
                          <div className="text-gray-300">
                            {formatRelativeTime(project.createdAt)}
                          </div>
                        </div>
                        <div className="bg-gray-700/50 rounded p-2">
                          <div className="text-gray-500 mb-1">最新版本</div>
                          <div className="text-gray-300">
                            {project.versions[0]?.version.substring(0, 8)}
                          </div>
                        </div>
                      </div>

                      {!isSynced && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPull(project.id);
                          }}
                          disabled={isLoading}
                          className={clsx(
                            'w-full flex items-center justify-center gap-2 py-2 rounded text-xs transition-colors',
                            isLoading
                              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              : 'bg-green-600 hover:bg-green-700 text-white'
                          )}
                        >
                          <Download size={14} />
                          克隆到本地
                        </button>
                      )}
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
