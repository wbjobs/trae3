import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  InputNumber,
  Button,
  message,
  Switch,
  Divider,
  Space,
  Descriptions,
  Alert,
  Row,
  Col,
  Statistic,
  Tag,
  Modal,
  Typography,
  List
} from 'antd';
import {
  SettingOutlined,
  CloudServerOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  FolderOpenOutlined
} from '@ant-design/icons';
import apiService from '../services/apiClient';

const { Title, Text, Paragraph } = Typography;

const Settings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backendConfig, setBackendConfig] = useState<{
    backendPort: number;
    maxConcurrentTasks: number;
  }>({
    backendPort: 3000,
    maxConcurrentTasks: 3
  });
  const [systemInfo, setSystemInfo] = useState<{
    platform: string;
    nodeVersion: string;
    appVersion: string;
    databasePath: string;
    firmwareStoragePath: string;
    logStoragePath: string;
    uptime: number;
  } | null>(null);
  const [aboutModalVisible, setAboutModalVisible] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const result = await apiService.getConcurrentSettings();
      if (result.success && result.data) {
        setBackendConfig(prev => ({
          ...prev,
          maxConcurrentTasks: result.data!.maxConcurrentTasks
        }));
        form.setFieldsValue({
          maxConcurrentTasks: result.data.maxConcurrentTasks
        });
      }

      if (window.appAPI) {
        const config = await window.appAPI.getConfig();
        setBackendConfig(prev => ({
          ...prev,
          backendPort: config.backendPort
        }));
        form.setFieldsValue({
          backendPort: config.backendPort
        });

        const info = await window.appAPI.getSystemInfo();
        setSystemInfo(info);
      }
    } catch (error) {
      message.error('加载设置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (values: { maxConcurrentTasks: number; backendPort: number }) => {
    setSaving(true);
    try {
      const concurrentResult = await apiService.setConcurrentSettings(values.maxConcurrentTasks);
      if (!concurrentResult.success) {
        message.error(concurrentResult.error || '保存并发设置失败');
        return;
      }

      if (window.appAPI && values.backendPort !== backendConfig.backendPort) {
        const saveResult = await window.appAPI.saveConfig({ backendPort: values.backendPort });
        if (!saveResult.success) {
          message.error(saveResult.error || '保存端口设置失败');
          return;
        }
        message.warning('端口设置已保存，重启应用后生效');
      }

      message.success('设置保存成功');
      setBackendConfig(values);
    } catch (error) {
      message.error('保存设置失败');
    } finally {
      setSaving(false);
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}天`);
    if (hours > 0) parts.push(`${hours}小时`);
    if (minutes > 0) parts.push(`${minutes}分钟`);
    parts.push(`${secs}秒`);
    
    return parts.join(' ');
  };

  const openDataFolder = async (type: 'database' | 'firmware' | 'logs') => {
    if (!window.appAPI) return;
    try {
      await window.appAPI.openPath(type);
    } catch (error) {
      message.error('打开目录失败');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="后端服务端口"
              value={backendConfig.backendPort}
              prefix={<CloudServerOutlined />}
              suffix={<Tag color="green">运行中</Tag>}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="最大并发任务数"
              value={backendConfig.maxConcurrentTasks}
              prefix={<AppstoreOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="系统运行时间"
              value={systemInfo ? formatUptime(systemInfo.uptime) : '-'}
              prefix={<InfoCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <SettingOutlined />
                <span>系统设置</span>
              </Space>
            }
            loading={loading}
            extra={
              <Space>
                <Button icon={<ReloadOutlined />} onClick={loadSettings}>刷新</Button>
              </Space>
            }
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              initialValues={backendConfig}
            >
              <Alert
                message="提示"
                description="修改后端服务端口后需要重启应用才能生效。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              
              <Form.Item
                name="backendPort"
                label="后端服务端口"
                rules={[
                  { required: true, message: '请输入端口号' },
                  { type: 'number', min: 1024, max: 65535, message: '端口号必须在 1024-65535 之间' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={1024}
                  max={65535}
                  placeholder="请输入端口号"
                />
              </Form.Item>

              <Form.Item
                name="maxConcurrentTasks"
                label="最大并发升级任务数"
                rules={[
                  { required: true, message: '请输入并发任务数' },
                  { type: 'number', min: 1, max: 20, message: '并发任务数必须在 1-20 之间' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  max={20}
                  placeholder="请输入并发任务数"
                />
              </Form.Item>

              <Divider />

              <Title level={5} style={{ marginTop: 0 }}>日志设置</Title>
              
              <Form.Item
                label="启用数据库日志"
                name="enableDatabaseLog"
                valuePropName="checked"
                initialValue={true}
              >
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>

              <Form.Item
                label="启用文件日志"
                name="enableFileLog"
                valuePropName="checked"
                initialValue={true}
              >
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>

              <Divider />

              <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                <Space>
                  <Button htmlType="button" onClick={loadSettings}>重置</Button>
                  <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                    保存设置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <DatabaseOutlined />
                <span>数据存储</span>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <List
              size="small"
              dataSource={[
                {
                  key: 'database',
                  icon: <DatabaseOutlined />,
                  label: '数据库文件',
                  path: systemInfo?.databasePath || '-',
                  desc: 'SQLite 数据库文件，存储终端、固件、任务等数据'
                },
                {
                  key: 'firmware',
                  icon: <FileTextOutlined />,
                  label: '固件存储目录',
                  path: systemInfo?.firmwareStoragePath || '-',
                  desc: '上传的固件文件存储位置'
                },
                {
                  key: 'logs',
                  icon: <FileTextOutlined />,
                  label: '日志存储目录',
                  path: systemInfo?.logStoragePath || '-',
                  desc: '系统日志文件存储位置'
                }
              ]}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      type="link"
                      size="small"
                      icon={<FolderOpenOutlined />}
                      onClick={() => openDataFolder(item.key as 'database' | 'firmware' | 'logs')}
                    >
                      打开目录
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={item.icon}
                    title={item.label}
                    description={
                      <div>
                        <div style={{ 
                          fontFamily: 'monospace', 
                          fontSize: 12, 
                          color: '#666',
                          wordBreak: 'break-all'
                        }}>
                          {item.path}
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.desc}
                        </Text>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>

          <Card
            title={
              <Space>
                <InfoCircleOutlined />
                <span>系统信息</span>
              </Space>
            }
            extra={
              <Button type="link" size="small" onClick={() => setAboutModalVisible(true)}>
                关于
              </Button>
            }
          >
            {systemInfo ? (
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="操作系统">
                  <Tag color="blue">{systemInfo.platform}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Node.js 版本">
                  <Tag color="green">{systemInfo.nodeVersion}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="应用版本">
                  <Tag color="purple">{systemInfo.appVersion}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="运行时间">
                  {formatUptime(systemInfo.uptime)}
                </Descriptions.Item>
              </Descriptions>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>
                加载中...
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="关于固件远程管理系统"
        open={aboutModalVisible}
        onCancel={() => setAboutModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setAboutModalVisible(false)}>关闭</Button>
        ]}
        width={500}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }}>
            <CloudServerOutlined />
          </div>
          <Title level={3} style={{ margin: 0 }}>固件远程管理系统</Title>
          <Text type="secondary">Firmware Remote Management System</Text>
        </div>
        
        <Divider />
        
        <div style={{ padding: '0 20px' }}>
          <Paragraph>
            <strong>版本：</strong>{systemInfo?.appVersion || '1.0.0'}
          </Paragraph>
          <Paragraph>
            本系统是一款工业扫码终端固件远程管理桌面应用，支持：
          </Paragraph>
          <List
            size="small"
            dataSource={[
              '批量发现局域网终端设备',
              '固件合法性校验（MD5/SHA256）',
              '远程批量升级终端固件',
              '终端分组管理',
              '完整的操作日志记录',
              'Windows/Linux 双平台支持'
            ]}
            renderItem={(item) => <List.Item>✓ {item}</List.Item>}
          />
          <Divider />
          <Paragraph style={{ textAlign: 'center', color: '#999', fontSize: 12 }}>
            © 2024 Firmware Remote Management System. All rights reserved.
          </Paragraph>
        </div>
      </Modal>
    </div>
  );
};

export default Settings;
