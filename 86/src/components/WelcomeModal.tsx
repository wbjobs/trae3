import { Modal, Button } from 'antd';
import {
  FolderOpenOutlined,
  PlusOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  BugOutlined,
  SyncOutlined,
  DatabaseOutlined
} from '@ant-design/icons';

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
}

function WelcomeModal({ open, onClose }: WelcomeModalProps) {
  const handleOpenProject = async () => {
    try {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: '选择项目文件夹'
      });

      if (selected && typeof selected === 'string') {
        const { invokeLoadProject } = await import('@/api/invoke');
        const project = await invokeLoadProject(selected);
        const { useAppStore } = await import('@/store');
        useAppStore.getState().setCurrentProject(project);
        onClose();
      }
    } catch (error) {
      console.error('Open project failed:', error);
    }
  };

  const handleNewProject = async () => {
    const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: '选择项目位置'
    });

    if (selected && typeof selected === 'string') {
      const { invokeCreateProject } = await import('@/api/invoke');
      const project = await invokeCreateProject('新项目', selected, '');
      const { useAppStore } = await import('@/store');
      useAppStore.getState().setCurrentProject(project);
      onClose();
    }
  };

  const handleBrowseCloud = () => {
    // 打开云端脚本库
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      centered
      closable={false}
    >
      <div className="welcome-content">
        <div className="welcome-title">Script Workstation</div>
        <div className="welcome-subtitle">跨平台脚本开发与管理工作台</div>

        <div className="welcome-actions">
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={handleNewProject}
          >
            新建项目
          </Button>
          <Button
            size="large"
            icon={<FolderOpenOutlined />}
            onClick={handleOpenProject}
          >
            打开项目
          </Button>
          <Button
            size="large"
            icon={<CloudUploadOutlined />}
            onClick={handleBrowseCloud}
          >
            浏览云端
          </Button>
        </div>

        <div className="welcome-features">
          <div className="feature-item">
            <div className="feature-icon"><CodeOutlined /></div>
            <div className="feature-title">多语言解析</div>
            <div className="feature-desc">支持 JavaScript、TypeScript、Python、Rust、Go 等10+ 种脚本语言的词法和语法分析</div>
          </div>
          
          <div className="feature-item">
            <div className="feature-icon"><BugOutlined /></div>
            <div className="feature-title">智能检测</div>
            <div className="feature-desc">内置安全漏洞检测、代码质量分析、圈复杂度计算等 10+ 条检查规则</div>
          </div>
          
          <div className="feature-item">
            <div className="feature-icon"><SyncOutlined /></div>
            <div className="feature-title">云同步</div>
            <div className="feature-desc">对接云端脚本库，支持自动同步、版本管理、冲突解决</div>
          </div>
          
          <div className="feature-item">
            <div className="feature-icon"><DatabaseOutlined /></div>
            <div className="feature-title">版本控制</div>
            <div className="feature-desc">本地 SQLite 数据库存储完整版本历史，支持一键回滚</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default WelcomeModal;
