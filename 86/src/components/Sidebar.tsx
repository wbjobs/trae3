import { useState } from 'react';
import { Menu, Tree, Empty } from 'antd';
import {
  FolderOutlined,
  CloudOutlined,
  FileTextOutlined,
  HistoryOutlined,
  SearchOutlined,
  FileOutlined
} from '@ant-design/icons';
import { useAppStore } from '@/store';
import type { ScriptFile, LocalProject } from '@/types';

interface SidebarProps {
  collapsed: boolean;
}

function Sidebar({ collapsed }: SidebarProps) {
  const [activeKey, setActiveKey] = useState('explorer');
  const { currentProject, openFile, currentFile } = useAppStore();

  const menuItems = [
    { key: 'explorer', icon: <FolderOutlined />, label: '资源' },
    { key: 'cloud', icon: <CloudOutlined />, label: '云端' },
    { key: 'search', icon: <SearchOutlined />, label: '搜索' },
    { key: 'history', icon: <HistoryOutlined />, label: '历史' }
  ];

  const buildTreeData = (project: LocalProject) => {
    const fileMap = new Map<string, any>();
    const rootNodes: any[] = [];

    project.scripts.forEach(script => {
      const parts = script.path.split(/[\\/]/);
      let currentPath = '';
      
      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;
        const prevPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!fileMap.has(currentPath)) {
          const node = {
            key: currentPath,
            title: part,
            children: [],
            isLeaf: isLast,
            icon: isLast ? <FileOutlined /> : <FolderOutlined />,
            script: isLast ? script : undefined
          };

          fileMap.set(currentPath, node);

          if (index === 0) {
            rootNodes.push(node);
          } else {
            const parent = fileMap.get(prevPath);
            if (parent) {
              parent.children.push(node);
            }
          }
        }
      });
    });

    return rootNodes;
  };

  const handleSelect = (selectedKeys: string[]) => {
    const key = selectedKeys[0];
    if (!key || !currentProject) return;

    const script = currentProject.scripts.find(s => s.path.includes(key));
    if (script) {
      openFile(script);
    }
  };

  const renderContent = () => {
    if (collapsed) return null;

    switch (activeKey) {
      case 'explorer':
        if (!currentProject) {
          return (
            <div style={{ padding: 20, textAlign: 'center' }}>
              <Empty description="未加载项目" />
            </div>
          );
        }

        return (
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              {currentProject.name} ({currentProject.scripts.length} 个文件)
            </div>
            <Tree
              showIcon
              defaultExpandAll
              treeData={buildTreeData(currentProject)}
              onSelect={handleSelect}
              selectedKeys={currentFile ? [currentFile.path] : []}
            />
          </div>
        );

      case 'cloud':
        return (
          <div className="sidebar-section">
            <div className="sidebar-section-title">云端脚本库</div>
            <CloudScriptsPanel />
          </div>
        );

      case 'search':
        return (
          <div className="sidebar-section">
            <div className="sidebar-section-title">搜索</div>
            <SearchPanel />
          </div>
        );

      case 'history':
        return (
          <div className="sidebar-section">
            <div className="sidebar-section-title">最近打开</div>
            <RecentFilesPanel />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Menu
        mode="horizontal"
        theme="dark"
        selectedKeys={[activeKey]}
        onClick={({ key }) => setActiveKey(key)}
        items={menuItems}
        style={{ borderRight: 'none', borderBottom: '1px solid #2a2a2a' }}
      />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {renderContent()}
      </div>
    </div>
  );
}

function CloudScriptsPanel() {
  return (
    <div style={{ padding: 8, fontSize: 12, color: '#8c8c8c' }}>
      请先配置云同步设置
    </div>
  );
}

function SearchPanel() {
  return (
    <div style={{ padding: 8, fontSize: 12, color: '#8c8c8c' }}>
      输入关键词搜索
    </div>
  );
}

function RecentFilesPanel() {
  const { openFiles, openFile } = useAppStore();

  if (openFiles.length === 0) {
    return (
      <div style={{ padding: 8, fontSize: 12, color: '#8c8c8c' }}>
        暂无最近文件
      </div>
    );
  }

  return (
    <div>
      {openFiles.map(file => (
        <div
          key={file.id}
          className="file-item"
          onClick={() => openFile(file)}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <FileTextOutlined style={{ fontSize: 12 }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
        </div>
      ))}
    </div>
  );
}

export default Sidebar;
