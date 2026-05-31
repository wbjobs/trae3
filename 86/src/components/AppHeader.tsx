import { Button, Space } from 'antd';
import {
  FolderOpenOutlined,
  SaveOutlined,
  CloudSyncOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { useAppStore } from '@/store';
import { invokeSaveFile, invokeSyncNow } from '@/api/invoke';
import { message } from 'antd';

function AppHeader() {
  const { currentFile, currentProject, setSyncStatus, syncConfig } = useAppStore();

  const handleOpenProject = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择项目文件夹'
      });

      if (selected && typeof selected === 'string') {
        const { invokeLoadProject } = await import('@/api/invoke');
        const project = await invokeLoadProject(selected);
        useAppStore.getState().setCurrentProject(project);
        useAppStore.getState().setProjects(
          [...useAppStore.getState().projects.filter(p => p.id !== project.id), project]
        );
        message.success(`已加载项目: ${project.name}`);
      }
    } catch (error) {
      message.error('打开项目失败');
    }
  };

  const handleSave = async () => {
    if (!currentFile) {
      message.warning('没有需要保存的文件');
      return;
    }
    try {
      await invokeSaveFile(currentFile);
      message.success('文件已保存');
    } catch (error) {
      message.error('保存失败');
    }
  };

  const handleSync = async () => {
    if (!syncConfig.apiKey) {
      message.warning('请先配置云同步设置');
      return;
    }
    try {
      setSyncStatus({ isSyncing: true, pendingFiles: 0, totalFiles: 0 });
      await invokeSyncNow();
      message.success('同步完成');
      const status = await (await import('@/api/invoke')).invokeGetSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      message.error('同步失败');
    } finally {
      const status = await (await import('@/api/invoke')).invokeGetSyncStatus();
      setSyncStatus(status);
    }
  };

  const handleSettings = async () => {
    const showSettingsModal = (await import('./SettingsModal')).default;
    showSettingsModal();
  };

  return (
    <div className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Script Workstation</span>
        {currentProject && (
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            {currentProject.name}
          </span>
        )}
      </div>

      <Space>
        <Button
          type="text"
          icon={<FolderOpenOutlined />}
          onClick={handleOpenProject}
          size="small"
        >
          打开项目
        </Button>
        <Button
          type="text"
          icon={<SaveOutlined />}
          onClick={handleSave}
          size="small"
        >
          保存
        </Button>
        <Button
          type="text"
          icon={<CloudSyncOutlined />}
          onClick={handleSync}
          size="small"
        >
          同步
        </Button>
        <Button
          type="text"
          icon={<SettingOutlined />}
          onClick={handleSettings}
          size="small"
        />
      </Space>
    </div>
  );
}

export default AppHeader;
