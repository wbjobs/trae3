import React from 'react';
import { createRoot } from 'react-dom/client';
import { Modal, Form, Input, InputNumber, Switch, Button, message } from 'antd';
import { useAppStore } from '@/store';
import { invokeSaveSyncConfig, invokeTestConnection } from '@/api/invoke';
import type { SyncConfig } from '@/types';

interface SettingsModalProps {
  onClose: () => void;
}

function SettingsModal({ onClose }: SettingsModalProps) {
  const [form] = Form.useForm();
  const { syncConfig, setSyncConfig, setIsLoading } = useAppStore();

  const handleOk = async (values: SyncConfig) => {
    setIsLoading(true);
    try {
      await invokeSaveSyncConfig(values);
      setSyncConfig(values);
      message.success('设置已保存');
      onClose();
    } catch (error) {
      message.error('保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const values = form.getFieldsValue();
    if (!values.serverUrl || !values.apiKey) {
      message.warning('请填写服务器地址和API密钥');
      return;
    }

    try {
      const success = await invokeTestConnection(values.serverUrl, values.apiKey);
      if (success) {
        message.success('连接成功');
      } else {
        message.error('连接失败，请检查配置');
      }
    } catch (error) {
      message.error('连接测试失败');
    }
  };

  return (
    <Modal
      open
      title="设置"
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={syncConfig}
        onFinish={handleOk}
      >
        <div className="sidebar-section-title" style={{ marginBottom: 12 }}>云同步配置</div>

        <Form.Item
          name="serverUrl"
          label="服务器地址"
          rules={[{ required: true, message: '请输入服务器地址' }]}
        >
          <Input placeholder="https://api.example.com" />
        </Form.Item>

        <Form.Item
          name="apiKey"
          label="API 密钥"
          rules={[{ required: true, message: '请输入API密钥' }]}
        >
          <Input.Password placeholder="请输入API密钥" />
        </Form.Item>

        <Form.Item
          name="username"
          label="用户名"
        >
          <Input placeholder="可选" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 4 }}>
          <Button
            type="default"
            onClick={handleTestConnection}
            block
          >
            测试连接
          </Button>
        </Form.Item>

        <div className="sidebar-section-title" style={{ marginBottom: 12, marginTop: 24 }}>同步设置</div>

        <Form.Item
          name="autoSync"
          label="自动同步"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name="syncInterval"
          label="同步间隔（秒）"
          rules={[{ required: true, message: '请输入同步间隔' }]}
        >
          <InputNumber min={60} max={3600} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" htmlType="submit">保存</Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
}

function showSettingsModal() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const close = () => {
    setTimeout(() => {
      root.unmount();
      document.body.removeChild(container);
    }, 300);
  };

  root.render(<SettingsModal onClose={close} />);
}

export default showSettingsModal;
