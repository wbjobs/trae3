import { CloseOutlined } from '@ant-design/icons';
import { useAppStore } from '@/store';

function TabBar() {
  const { openFiles, currentFile, openFile, closeFile, activeTab, setActiveTab } = useAppStore();

  const tabs = [
    { key: 'editor', label: '编辑器' },
    { key: 'ast', label: 'AST视图' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="tab-bar">
        {openFiles.map(file => (
          <div
            key={file.id}
            className={`tab-item ${currentFile?.id === file.id ? 'active' : ''}`}
            onClick={() => openFile(file)}
          >
            <span>{file.name}</span>
            {!file.is_synced && (
              <span style={{ 
                width: 8, 
                height: 8, 
                borderRadius: '50%', 
                background: '#faad14',
                fontSize: 0 
              }}>●</span>
            )}
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeFile(file.id);
              }}
            >
              <CloseOutlined />
            </span>
          </div>
        ))}
      </div>

      {openFiles.length > 0 && (
        <div style={{
          height: 28,
          background: '#141414',
          borderBottom: '1px solid #2a2a2a',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          gap: 4
        }}>
          {tabs.map(tab => (
            <div
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                cursor: 'pointer',
                borderRadius: '4px 4px 0 0',
                color: activeTab === tab.key ? '#ffffff' : '#8c8c8c',
                background: activeTab === tab.key ? '#1e1e1e' : 'transparent',
                borderBottom: activeTab === tab.key ? '2px solid #1677ff' : 'none'
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TabBar;
