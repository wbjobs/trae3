import React from 'react';
import {
  FolderOpen,
  FolderPlus,
  Trash2,
  Cloud,
  Clock,
  FileCode,
  HardDrive,
  ChevronRight,
  Edit3,
} from 'lucide-react';
import clsx from 'clsx';
import { Project } from '../../shared/types';
import { formatRelativeTime, formatFileSize } from '../../shared/utils';

interface ProjectListProps {
  projects: Project[];
  onProjectSelect: (projectId: string) => void;
  onProjectDelete: (projectId: string) => void;
  onNewProject: () => void;
  isLoading: boolean;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onProjectSelect,
  onProjectDelete,
  onNewProject,
  isLoading,
}) => {
  const handleDelete = async (e: React.MouseEvent, projectId: string, projectName: string) => {
    e.stopPropagation();

    const result = await window.electronAPI.dialog.showMessageBox({
      type: 'warning',
      title: '确认删除',
      message: `确定要删除项目 "${projectName}" 吗？\n此操作不可恢复。`,
      buttons: ['取消', '删除'],
      defaultId: 1,
    });

    if (result.response === 1) {
      onProjectDelete(projectId);
    }
  };

  return (
    <div className="h-full bg-gray-900 text-white overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Project Studio</h1>
            <p className="text-gray-400">跨平台多文件项目编辑器</p>
          </div>
          <button
            onClick={onNewProject}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <FolderPlus size={18} />
            新建项目
          </button>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">我的项目</h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-gray-800 rounded-xl p-12 text-center">
              <FolderOpen size={48} className="mx-auto mb-4 text-gray-500" />
              <p className="text-gray-400 mb-4">暂无项目</p>
              <button
                onClick={onNewProject}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                创建第一个项目
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => {
                const totalSize = project.files.reduce((sum, f) => sum + f.size, 0);

                return (
                  <div
                    key={project.id}
                    onClick={() => onProjectSelect(project.id)}
                    className={clsx(
                      'bg-gray-800 rounded-xl p-5 cursor-pointer transition-all',
                      'hover:bg-gray-750 hover:shadow-lg hover:shadow-black/20',
                      'group border border-gray-700 hover:border-gray-600'
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                          <FolderOpen size={20} className="text-blue-400" />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-100 group-hover:text-white">
                            {project.name}
                          </h3>
                          {project.cloudId && (
                            <span className="flex items-center gap-1 text-xs text-green-400">
                              <Cloud size={10} />
                              已同步
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleDelete(e, project.id, project.name)}
                          className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                          title="删除项目"
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                        <ChevronRight size={16} className="text-gray-500" />
                      </div>
                    </div>

                    {project.description && (
                      <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                        {project.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <FileCode size={12} />
                        {project.files.length} 个文件
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive size={12} />
                        {formatFileSize(totalSize)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
                      <Clock size={12} />
                      <span>更新于 {formatRelativeTime(project.updatedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800">
          <h3 className="text-sm font-medium text-gray-400 mb-4">功能特性</h3>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center mb-3">
                <Edit3 size={16} className="text-blue-400" />
              </div>
              <h4 className="text-sm font-medium text-gray-200 mb-1">代码编辑</h4>
              <p className="text-xs text-gray-500">多语言语法高亮，智能补全</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="w-8 h-8 rounded-lg bg-yellow-600/20 flex items-center justify-center mb-3">
                <FileCode size={16} className="text-yellow-400" />
              </div>
              <h4 className="text-sm font-medium text-gray-200 mb-1">语法校验</h4>
              <p className="text-xs text-gray-500">实时代码检查，错误提示</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="w-8 h-8 rounded-lg bg-green-600/20 flex items-center justify-center mb-3">
                <Cloud size={16} className="text-green-400" />
              </div>
              <h4 className="text-sm font-medium text-gray-200 mb-1">云端同步</h4>
              <p className="text-xs text-gray-500">多设备同步，云端存储</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center mb-3">
                <Clock size={16} className="text-purple-400" />
              </div>
              <h4 className="text-sm font-medium text-gray-200 mb-1">版本管理</h4>
              <p className="text-xs text-gray-500">历史版本追溯，一键回滚</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
