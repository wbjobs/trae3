import React from 'react';
import { X, Circle } from 'lucide-react';
import clsx from 'clsx';
import { ProjectFile } from '../../shared/types';
import { formatFileSize, formatRelativeTime } from '../../shared/utils';

interface EditorTabsProps {
  files: ProjectFile[];
  activeFileId: string | null;
  onTabClick: (fileId: string) => void;
  onTabClose: (fileId: string) => void;
}

export const EditorTabs: React.FC<EditorTabsProps> = ({
  files,
  activeFileId,
  onTabClick,
  onTabClose,
}) => {
  if (files.length === 0) return null;

  return (
    <div className="flex items-stretch bg-gray-800 border-b border-gray-700 overflow-x-auto">
      {files.map((file) => {
        const isActive = file.id === activeFileId;
        return (
          <div
            key={file.id}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 cursor-pointer border-r border-gray-700 group',
              'min-w-[150px] max-w-[250px] transition-colors',
              isActive
                ? 'bg-gray-900 text-white border-t-2 border-t-blue-500'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            )}
            onClick={() => onTabClick(file.id)}
            title={`${file.path}\n大小: ${formatFileSize(file.size)}\n修改于: ${formatRelativeTime(file.lastModified)}`}
          >
            <Circle
              size={8}
              className={clsx(
                'flex-shrink-0 transition-all',
                file.isDirty ? 'text-orange-400 fill-orange-400' : 'text-transparent'
              )}
            />
            <span className="flex-1 truncate text-sm">{file.name}</span>
            {file.isDirty && (
              <span className="text-orange-400 text-xs">*</span>
            )}
            <button
              className={clsx(
                'p-0.5 rounded transition-colors',
                'opacity-0 group-hover:opacity-100 hover:bg-gray-600',
                isActive ? 'opacity-100' : ''
              )}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(file.id);
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
