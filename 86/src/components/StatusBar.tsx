import { Tag } from 'antd';
import {
  CloudOutlined,
  CloudSyncOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  AlertOutlined
} from '@ant-design/icons';
import { useAppStore } from '@/store';

function StatusBar() {
  const { currentFile, syncStatus, syntaxResult, syncConfig } = useAppStore();

  const renderSyncStatus = () => {
    if (!syncConfig.apiKey) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertOutlined style={{ color: '#faad14' }} />
          <span>未配置云同步</span>
        </span>
      );
    }

    if (syncStatus.isSyncing) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <LoadingOutlined />
          <span>同步中... ({syncStatus.pendingFiles}/{syncStatus.totalFiles})</span>
        </span>
      );
    }

    if (syncStatus.pendingFiles > 0) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <CloudOutlined style={{ color: '#faad14' }} />
          <span>{syncStatus.pendingFiles} 个文件待同步</span>
        </span>
      );
    }

    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <CheckCircleOutlined style={{ color: '#52c41a' }} />
        <span>已同步</span>
      </span>
    );
  };

  return (
    <div className="status-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {renderSyncStatus()}
        
        {syntaxResult && (
          <span>
            {syntaxResult.issues.filter(i => i.severity === 'error').length > 0 && (
              <Tag color="red" style={{ marginRight: 4 }}>
                {syntaxResult.issues.filter(i => i.severity === 'error').length} 错误
              </Tag>
            )}
            {syntaxResult.issues.filter(i => i.severity === 'warning').length > 0 && (
              <Tag color="orange">
                {syntaxResult.issues.filter(i => i.severity === 'warning').length} 警告
              </Tag>
            )}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {currentFile && (
          <>
            <span>
              {currentFile.language.charAt(0).toUpperCase() + currentFile.language.slice(1)}
            </span>
            <span>UTF-8</span>
            <span>行 {currentFile.content.split('\n').length}</span>
            <span>{currentFile.size} 字节</span>
          </>
        )}
      </div>
    </div>
  );
}

export default StatusBar;
