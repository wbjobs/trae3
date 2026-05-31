import React, { useState, useMemo, useCallback } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileJson,
  Database,
  FileCog,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { ProjectFile } from '../../shared/types';
import { useAppStore } from '@/store/useAppStore';
import { isValidFileName, getLanguageFromFileName } from '../../shared/utils';

interface FileTreeProps {
  files: ProjectFile[];
  onFileSelect: (file: ProjectFile) => void;
  activeFileId: string | null;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  file?: ProjectFile;
  children: TreeNode[];
}

function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  files.forEach((file) => {
    const parts = file.path.split('/').filter(Boolean);
    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (i === parts.length - 1) {
        const existingNode = currentLevel.find(
          (n) => n.name === part && n.type === 'file'
        );
        if (!existingNode) {
          currentLevel.push({
            name: part,
            path: currentPath,
            type: 'file',
            file,
            children: [],
          });
        }
      } else {
        let folderNode = currentLevel.find(
          (n) => n.name === part && n.type === 'folder'
        );
        if (!folderNode) {
          folderNode = {
            name: part,
            path: currentPath,
            type: 'folder',
            children: [],
          };
          currentLevel.push(folderNode);
        }
        currentLevel = folderNode.children;
      }
    }
  });

  const sortTree = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) => ({
        ...node,
        children: node.type === 'folder' ? sortTree(node.children) : [],
      }));
  };

  return sortTree(root);
}

const FileIcon = React.memo(function FileIcon({ language }: { language: string }) {
  const iconProps = { size: 16 };
  switch (language) {
    case 'json':
      return <FileJson {...iconProps} className="text-yellow-400" />;
    case 'sql':
      return <Database {...iconProps} className="text-orange-400" />;
    case 'yaml':
    case 'shell':
    case 'bat':
      return <FileCog {...iconProps} className="text-gray-400" />;
    case 'markdown':
    case 'html':
    case 'css':
      return <FileText {...iconProps} className="text-green-400" />;
    default:
      return <FileCode {...iconProps} className="text-blue-400" />;
  }
});

interface FolderNodeProps {
  node: TreeNode;
  level: number;
  expandedFolders: Set<string>;
  onToggle: (path: string) => void;
  activeFileId: string | null;
  onFileSelect: (file: ProjectFile) => void;
  onDeleteFile: (file: ProjectFile) => void;
  onEditFile: (path: string, name: string) => void;
  onNewFile: (path: string) => void;
  newFilePath: string | null;
  newFileName: string;
  onNewFileSubmit: (path: string, name: string) => void;
  onNewFileCancel: () => void;
}

const FolderNode: React.FC<FolderNodeProps> = React.memo(function FolderNode({
  node,
  level,
  expandedFolders,
  onToggle,
  activeFileId,
  onFileSelect,
  onDeleteFile,
  onEditFile,
  onNewFile,
  newFilePath,
  newFileName,
  onNewFileSubmit,
  onNewFileCancel,
}) {
  const isExpanded = expandedFolders.has(node.path);

  return (
    <div>
      <div
        className={clsx(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-700 rounded text-sm',
          'group'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onToggle(node.path)}
      >
        {isExpanded ? (
          <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
        )}
        {isExpanded ? (
          <FolderOpen size={16} className="text-yellow-500 flex-shrink-0" />
        ) : (
          <Folder size={16} className="text-yellow-500 flex-shrink-0" />
        )}
        <span className="flex-1 text-gray-200 truncate">{node.name}</span>
        <button
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onNewFile(node.path);
          }}
          title="新建文件"
        >
          <Plus size={14} className="text-green-400" />
        </button>
      </div>

      {newFilePath === node.path && (
        <div
          className="flex items-center gap-1 px-2 py-1 bg-gray-700"
          style={{ paddingLeft: `${level * 16 + 24}px` }}
        >
          <input
            type="text"
            value={newFileName}
            onChange={(e) => onNewFileSubmit(node.path, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onNewFileSubmit(node.path, newFileName);
              if (e.key === 'Escape') onNewFileCancel();
            }}
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
            placeholder="文件名"
            autoFocus
          />
          <button
            onClick={() => onNewFileSubmit(node.path, newFileName)}
            className="p-1 hover:bg-gray-600 rounded"
          >
            <Check size={14} className="text-green-400" />
          </button>
          <button
            onClick={onNewFileCancel}
            className="p-1 hover:bg-gray-600 rounded"
          >
            <X size={14} className="text-red-400" />
          </button>
        </div>
      )}

      {isExpanded && (
        <div>
          {node.children.map((child) =>
            child.type === 'folder' ? (
              <FolderNode
                key={child.path}
                node={child}
                level={level + 1}
                expandedFolders={expandedFolders}
                onToggle={onToggle}
                activeFileId={activeFileId}
                onFileSelect={onFileSelect}
                onDeleteFile={onDeleteFile}
                onEditFile={onEditFile}
                onNewFile={onNewFile}
                newFilePath={newFilePath}
                newFileName={newFileName}
                onNewFileSubmit={onNewFileSubmit}
                onNewFileCancel={onNewFileCancel}
              />
            ) : (
              <FileNode
                key={child.path}
                node={child}
                level={level + 1}
                activeFileId={activeFileId}
                onFileSelect={onFileSelect}
                onDeleteFile={onDeleteFile}
                onEditFile={onEditFile}
              />
            )
          )}
        </div>
      )}
    </div>
  );
});

interface FileNodeProps {
  node: TreeNode;
  level: number;
  activeFileId: string | null;
  onFileSelect: (file: ProjectFile) => void;
  onDeleteFile: (file: ProjectFile) => void;
  onEditFile: (path: string, name: string) => void;
}

const FileNode: React.FC<FileNodeProps> = React.memo(function FileNode({
  node,
  level,
  activeFileId,
  onFileSelect,
  onDeleteFile,
  onEditFile,
}) {
  const isActive = node.file?.id === activeFileId;

  return (
    <div
      className={clsx(
        'flex items-center gap-1 px-2 py-1 cursor-pointer rounded text-sm group',
        isActive ? 'bg-blue-600/30 border-l-2 border-blue-500' : 'hover:bg-gray-700',
        node.file?.isDirty && 'border-l-2 border-orange-500'
      )}
      style={{ paddingLeft: `${level * 16 + 28}px` }}
      onClick={() => node.file && onFileSelect(node.file)}
    >
      <FileIcon language={node.file?.language || 'plaintext'} />
      <span
        className={clsx(
          'flex-1 truncate',
          isActive ? 'text-white' : 'text-gray-300',
          node.file?.isDirty && 'italic'
        )}
      >
        {node.name}
        {node.file?.isDirty && <span className="ml-1 text-orange-400">*</span>}
      </span>
      <button
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onEditFile(node.path, node.name);
        }}
        title="重命名"
      >
        <Edit3 size={12} className="text-gray-400" />
      </button>
      <button
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          node.file && onDeleteFile(node.file);
        }}
        title="删除"
      >
        <Trash2 size={12} className="text-red-400" />
      </button>
    </div>
  );
});

export const FileTree: React.FC<FileTreeProps> = React.memo(function FileTree({
  files,
  onFileSelect,
  activeFileId,
}) {
  const { expandedFolders, toggleFolder, currentProject, createNewFile, deleteFile } =
    useAppStore();
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newFilePath, setNewFilePath] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');

  const tree = useMemo(() => buildTree(files), [files]);

  const handleCreateFile = useCallback(async (parentPath: string, name: string) => {
    if (!currentProject || !name.trim()) return;

    const fullPath = parentPath ? `${parentPath}/${name}` : name;

    if (!isValidFileName(name)) {
      useAppStore.getState().setError('无效的文件名');
      return;
    }

    await createNewFile(name, fullPath, '');
    setNewFilePath(null);
    setNewFileName('');
  }, [currentProject, createNewFile]);

  const handleDeleteFile = useCallback(async (file: ProjectFile) => {
    if (!currentProject) return;

    const result = await window.electronAPI.dialog.showMessageBox({
      type: 'warning',
      title: '确认删除',
      message: `确定要删除文件 "${file.name}" 吗？`,
      buttons: ['取消', '删除'],
      defaultId: 1,
    });

    if (result.response === 1) {
      await deleteFile(file.id);
    }
  }, [currentProject, deleteFile]);

  const handleEditFile = useCallback((path: string, name: string) => {
    setEditingPath(path);
    setEditingName(name);
  }, []);

  const handleNewFile = useCallback((path: string) => {
    setNewFilePath(path);
    setNewFileName('');
  }, []);

  const handleNewFileCancel = useCallback(() => {
    setNewFilePath(null);
    setNewFileName('');
  }, []);

  return (
    <div className="h-full flex flex-col bg-gray-800 text-white">
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <span className="font-semibold text-sm text-gray-200">项目文件</span>
        <button
          onClick={() => {
            setNewFilePath('');
            setNewFileName('');
          }}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
          title="新建文件"
        >
          <Plus size={16} className="text-green-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {newFilePath === '' && (
          <div className="flex items-center gap-1 px-4 py-1 bg-gray-700">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFile('', newFileName);
                if (e.key === 'Escape') {
                  setNewFilePath(null);
                  setNewFileName('');
                }
              }}
              className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="文件名 (如: src/main.ts)"
              autoFocus
            />
            <button
              onClick={() => handleCreateFile('', newFileName)}
              className="p-1 hover:bg-gray-600 rounded"
            >
              <Check size={14} className="text-green-400" />
            </button>
            <button
              onClick={() => {
                setNewFilePath(null);
                setNewFileName('');
              }}
              className="p-1 hover:bg-gray-600 rounded"
            >
              <X size={14} className="text-red-400" />
            </button>
          </div>
        )}

        {tree.length === 0 ? (
          <div className="text-center text-gray-500 py-8 text-sm">
            暂无文件，点击 + 创建新文件
          </div>
        ) : (
          tree.map((node) =>
            node.type === 'folder' ? (
              <FolderNode
                key={node.path}
                node={node}
                level={0}
                expandedFolders={expandedFolders}
                onToggle={toggleFolder}
                activeFileId={activeFileId}
                onFileSelect={onFileSelect}
                onDeleteFile={handleDeleteFile}
                onEditFile={handleEditFile}
                onNewFile={handleNewFile}
                newFilePath={newFilePath}
                newFileName={newFileName}
                onNewFileSubmit={handleCreateFile}
                onNewFileCancel={handleNewFileCancel}
              />
            ) : (
              <FileNode
                key={node.path}
                node={node}
                level={0}
                activeFileId={activeFileId}
                onFileSelect={onFileSelect}
                onDeleteFile={handleDeleteFile}
                onEditFile={handleEditFile}
              />
            )
          )
        )}
      </div>
    </div>
  );
},
  (prev, next) => {
    return (
      prev.activeFileId === next.activeFileId &&
      prev.files.length === next.files.length &&
      prev.files.every((f, i) => 
        f.id === next.files[i].id && 
        f.name === next.files[i].name && 
        f.path === next.files[i].path &&
        f.isDirty === next.files[i].isDirty
      )
    );
  }
);
