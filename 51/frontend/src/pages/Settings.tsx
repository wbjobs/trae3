import React, { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Select,
  Input,
  Button,
  Space,
  message,
  List,
  Tag,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { logApi } from '../services/api';

interface FilterConfig {
  globalLevel: string;
  terminalOverrides: Record<string, string>;
  moduleFilters: string[];
  keywordFilters: string[];
}

const Settings: React.FC = () => {
  const [form] = Form.useForm();
  const [config, setConfig] = useState<FilterConfig | null>(null);
  const [newTerminalId, setNewTerminalId] = useState('');
  const [newTerminalLevel, setNewTerminalLevel] = useState('info');
  const [newModule, setNewModule] = useState('');
  const [newKeyword, setNewKeyword] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await logApi.getFilterConfig();
      setConfig(response.data);
      form.setFieldsValue(response.data);
    } catch (error) {
      message.error('加载配置失败');
    }
  };

  const handleSaveGlobalLevel = async (level: string) => {
    try {
      await logApi.updateFilterConfig({ globalLevel: level });
      message.success('更新成功');
      loadConfig();
    } catch (error) {
      message.error('更新失败');
    }
  };

  const handleAddTerminalOverride = async () => {
    if (!newTerminalId) {
      message.warning('请输入终端ID');
      return;
    }
    try {
      await logApi.updateFilterConfig({
        terminalOverrides: {
          ...config?.terminalOverrides,
          [newTerminalId]: newTerminalLevel,
        },
      });
      message.success('添加成功');
      setNewTerminalId('');
      loadConfig();
    } catch (error) {
      message.error('添加失败');
    }
  };

  const handleRemoveTerminalOverride = async (terminalId: string) => {
    try {
      const newOverrides = { ...config?.terminalOverrides };
      delete newOverrides[terminalId];
      await logApi.updateFilterConfig({ terminalOverrides: newOverrides });
      message.success('删除成功');
      loadConfig();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleAddModuleFilter = async () => {
    if (!newModule) {
      message.warning('请输入模块名');
      return;
    }
    try {
      await logApi.updateFilterConfig({
        moduleFilters: [...(config?.moduleFilters || []), newModule],
      });
      message.success('添加成功');
      setNewModule('');
      loadConfig();
    } catch (error) {
      message.error('添加失败');
    }
  };

  const handleRemoveModuleFilter = async (module: string) => {
    try {
      const newModules = config?.moduleFilters.filter(m => m !== module) || [];
      await logApi.updateFilterConfig({ moduleFilters: newModules });
      message.success('删除成功');
      loadConfig();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleAddKeywordFilter = async () => {
    if (!newKeyword) {
      message.warning('请输入关键词');
      return;
    }
    try {
      await logApi.updateFilterConfig({
        keywordFilters: [...(config?.keywordFilters || []), newKeyword],
      });
      message.success('添加成功');
      setNewKeyword('');
      loadConfig();
    } catch (error) {
      message.error('添加失败');
    }
  };

  const handleRemoveKeywordFilter = async (keyword: string) => {
    try {
      const newKeywords = config?.keywordFilters.filter(k => k !== keyword) || [];
      await logApi.updateFilterConfig({ keywordFilters: newKeywords });
      message.success('删除成功');
      loadConfig();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const levelOptions = [
    { value: 'debug', label: 'DEBUG' },
    { value: 'info', label: 'INFO' },
    { value: 'warning', label: 'WARNING' },
    { value: 'error', label: 'ERROR' },
    { value: 'critical', label: 'CRITICAL' },
  ];

  return (
    <div>
      <Card title="日志过滤配置" style={{ marginBottom: 16 }}>
        <Form layout="vertical">
          <Form.Item label="全局日志级别">
            <Select
              value={config?.globalLevel}
              style={{ width: 200 }}
              options={levelOptions}
              onChange={handleSaveGlobalLevel}
            />
          </Form.Item>
        </Form>
      </Card>

      <Card title="终端级别覆盖" style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="终端ID"
            style={{ width: 200 }}
            value={newTerminalId}
            onChange={e => setNewTerminalId(e.target.value)}
          />
          <Select
            value={newTerminalLevel}
            style={{ width: 150 }}
            options={levelOptions}
            onChange={setNewTerminalLevel}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddTerminalOverride}>
            添加
          </Button>
        </Space>
        <List
          dataSource={Object.entries(config?.terminalOverrides || {})}
          renderItem={([terminalId, level]) => (
            <List.Item
              actions={[
                <Button
                  type="link"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveTerminalOverride(terminalId)}
                >
                  删除
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={terminalId}
                description={
                  <Tag className={`log-level-${level}`}>
                    {level.toUpperCase()}
                  </Tag>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Card title="模块过滤" style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="模块名"
            style={{ width: 300 }}
            value={newModule}
            onChange={e => setNewModule(e.target.value)}
            onPressEnter={handleAddModuleFilter}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddModuleFilter}>
            添加
          </Button>
        </Space>
        <List
          dataSource={config?.moduleFilters || []}
          renderItem={module => (
            <List.Item
              actions={[
                <Button
                  type="link"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveModuleFilter(module)}
                >
                  删除
                </Button>,
              ]}
            >
              <Tag color="blue">{module}</Tag>
            </List.Item>
          )}
        />
      </Card>

      <Card title="关键词过滤">
        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="关键词"
            style={{ width: 300 }}
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            onPressEnter={handleAddKeywordFilter}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddKeywordFilter}>
            添加
          </Button>
        </Space>
        <List
          dataSource={config?.keywordFilters || []}
          renderItem={keyword => (
            <List.Item
              actions={[
                <Button
                  type="link"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveKeywordFilter(keyword)}
                >
                  删除
                </Button>,
              ]}
            >
              <Tag color="purple">{keyword}</Tag>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default Settings;