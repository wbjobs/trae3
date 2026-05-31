import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Card, Table, Tag, Button, Space, Modal, Form, Input, Select,
  Switch, InputNumber, message, Tabs, Badge, Popconfirm, List,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, BellOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { alertApi, AlertRule, Alert } from '../services/api';

const Alerts: React.FC = () => {
  const [activeTab, setActiveTab] = useState('alerts');
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertPagination, setAlertPagination] = useState({ current: 1, pageSize: 50, total: 0 });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [form] = Form.useForm();
  const [realtimeAlerts, setRealtimeAlerts] = useState<Alert[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    loadRules();
    loadAlerts();
    startEventSource();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const startEventSource = () => {
    try {
      const es = new EventSource(alertApi.getStreamUrl());
      es.onmessage = (event) => {
        try {
          const alert = JSON.parse(event.data);
          setRealtimeAlerts(prev => [alert, ...prev].slice(0, 20));
        } catch {}
      };
      es.onerror = () => {
        es.close();
      };
      eventSourceRef.current = es;
    } catch {}
  };

  const loadRules = async () => {
    try {
      const response = await alertApi.getRules();
      setRules(response.data);
    } catch (error) {
      message.error('加载告警规则失败');
    }
  };

  const loadAlerts = useCallback(async (page = 1, pageSize = 50) => {
    setAlertLoading(true);
    try {
      const response = await alertApi.getAlerts({ page, pageSize });
      setAlerts(response.data.data);
      setAlertPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: response.data.pagination.total,
      }));
    } catch (error) {
      message.error('加载告警列表失败');
    } finally {
      setAlertLoading(false);
    }
  }, []);

  const handleAddRule = () => {
    setEditingRule(null);
    form.resetFields();
    form.setFieldsValue({
      type: 'keyword',
      enabled: true,
      cooldown: 60,
      keywords: [],
      levels: [],
      modules: [],
      terminalIds: [],
    });
    setModalVisible(true);
  };

  const handleEditRule = (rule: AlertRule) => {
    setEditingRule(rule);
    form.setFieldsValue(rule);
    setModalVisible(true);
  };

  const handleSubmitRule = async () => {
    try {
      const values = await form.validateFields();
      if (editingRule) {
        await alertApi.updateRule(editingRule.id, values);
        message.success('更新成功');
      } else {
        await alertApi.createRule(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      loadRules();
    } catch (error) {
      message.error(editingRule ? '更新失败' : '创建失败');
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await alertApi.deleteRule(id);
      message.success('删除成功');
      loadRules();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleResolveAlert = async (id: number) => {
    try {
      await alertApi.resolveAlert(id);
      message.success('已标记为已解决');
      loadAlerts(alertPagination.current, alertPagination.pageSize);
    } catch (error) {
      message.error('操作失败');
    }
  };

  const getLevelColor = (level: string) => {
    const colors: Record<string, string> = {
      debug: 'default', info: 'blue', warning: 'orange', error: 'red', critical: 'red',
    };
    return colors[level] || 'default';
  };

  const ruleColumns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 100,
      render: (type: string) => type === 'keyword' ? '关键词' : '级别',
    },
    {
      title: '关键词', dataIndex: 'keywords', key: 'keywords',
      render: (keywords: string[]) =>
        keywords?.map(k => <Tag key={k} color="purple">{k}</Tag>),
    },
    {
      title: '监控级别', dataIndex: 'levels', key: 'levels',
      render: (levels: string[]) =>
        levels?.map(l => <Tag key={l} color={getLevelColor(l)}>{l.toUpperCase()}</Tag>),
    },
    {
      title: '状态', dataIndex: 'enabled', key: 'enabled', width: 80,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'default'}>{enabled ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '冷却(秒)', dataIndex: 'cooldown', key: 'cooldown', width: 100,
    },
    {
      title: '操作', key: 'actions', width: 150,
      render: (_: any, record: AlertRule) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleEditRule(record)}>编辑</Button>
          <Popconfirm title="确认删除" onConfirm={() => handleDeleteRule(record.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const alertColumns = [
    {
      title: '时间', dataIndex: 'created_at', key: 'created_at', width: 180,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    { title: '终端', dataIndex: 'terminal_id', key: 'terminal_id', width: 150 },
    {
      title: '级别', dataIndex: 'level', key: 'level', width: 100,
      render: (level: string) => <Tag color={getLevelColor(level)}>{level.toUpperCase()}</Tag>,
    },
    { title: '规则', dataIndex: 'rule_name', key: 'rule_name', width: 120 },
    {
      title: '消息', dataIndex: 'message', key: 'message', ellipsis: true,
    },
    {
      title: '状态', dataIndex: 'resolved', key: 'resolved', width: 100,
      render: (resolved: number) => (
        <Tag color={resolved ? 'green' : 'red'}>{resolved ? '已解决' : '未解决'}</Tag>
      ),
    },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: any, record: Alert) => (
        record.resolved ? null : (
          <Button type="link" size="small" icon={<CheckCircleOutlined />}
            onClick={() => handleResolveAlert(record.id)}>解决</Button>
        )
      ),
    },
  ];

  return (
    <div>
      {realtimeAlerts.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, borderColor: '#ff4d4f' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BellOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
            <span style={{ fontWeight: 500 }}>实时告警 ({realtimeAlerts.length})</span>
            <Button size="small" type="link" onClick={() => setRealtimeAlerts([])}>清除</Button>
          </div>
          <div style={{ maxHeight: 100, overflowY: 'auto', marginTop: 8 }}>
            {realtimeAlerts.map((alert, i) => (
              <div key={i} style={{ fontSize: 12, color: '#666', padding: '2px 0' }}>
                <Tag color={getLevelColor(alert.level)} style={{ marginRight: 4 }}>
                  {alert.level?.toUpperCase()}
                </Tag>
                [{alert.terminal_id}] {alert.message}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: 'alerts',
            label: <Badge count={alertPagination.total} offset={[10, 0]} size="small">告警记录</Badge>,
            children: (
              <Table
                dataSource={alerts}
                columns={alertColumns}
                rowKey="id"
                loading={alertLoading}
                pagination={{
                  ...alertPagination,
                  showSizeChanger: true,
                  showTotal: (total) => `共 ${total} 条`,
                  onChange: (page, pageSize) => loadAlerts(page, pageSize),
                }}
                size="small"
              />
            ),
          },
          {
            key: 'rules',
            label: '告警规则',
            children: (
              <>
                <div style={{ marginBottom: 16, textAlign: 'right' }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRule}>
                    新建规则
                  </Button>
                </div>
                <Table
                  dataSource={rules}
                  columns={ruleColumns}
                  rowKey="id"
                  pagination={false}
                  size="small"
                />
              </>
            ),
          },
        ]} />
      </Card>

      <Modal
        title={editingRule ? '编辑告警规则' : '新建告警规则'}
        open={modalVisible}
        onOk={handleSubmitRule}
        onCancel={() => setModalVisible(false)}
        width={600}
        okText="确认"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="例如：GPS信号丢失告警" />
          </Form.Item>
          <Form.Item name="type" label="规则类型">
            <Select>
              <Select.Option value="keyword">关键词匹配</Select.Option>
              <Select.Option value="level">级别触发</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="keywords" label="监控关键词">
            <Select mode="tags" placeholder="输入关键词后回车" tokenSeparators={[',']} open={false} />
          </Form.Item>
          <Form.Item name="levels" label="监控级别">
            <Select mode="multiple" placeholder="选择需要告警的级别">
              {['debug', 'info', 'warning', 'error', 'critical'].map(l => (
                <Select.Option key={l} value={l}>{l.toUpperCase()}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="modules" label="监控模块">
            <Select mode="tags" placeholder="输入模块名后回车" open={false} />
          </Form.Item>
          <Form.Item name="cooldown" label="冷却时间(秒)">
            <InputNumber min={1} max={3600} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Alerts;