import React, { useState, useEffect } from 'react';
import {
  Button,
  Card,
  Row,
  Col,
  Select,
  Table,
  Tag,
  Space,
  message,
  Modal,
  Form,
  Input,
  Checkbox
} from 'antd';
import {
  ScanOutlined,
  PlusOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import apiService from '../services/apiClient';
import type { NetworkScanResult, TerminalGroup } from '@shared/types';
import { TerminalStatus } from '@shared/types';

const { Option } = Select;

const TerminalDiscover: React.FC = () => {
  const [scanning, setScanning] = useState(false);
  const [networks, setNetworks] = useState<{ network: string; netmask: string }[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [selectedNetmask, setSelectedNetmask] = useState<string>('');
  const [scanResults, setScanResults] = useState<NetworkScanResult[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [groups, setGroups] = useState<TerminalGroup[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    loadNetworks();
    loadGroups();
  }, []);

  const loadNetworks = async () => {
    try {
      const res = await apiService.getNetworks();
      if (res.success && res.data) {
        setNetworks(res.data);
        if (res.data.length > 0) {
          setSelectedNetwork(res.data[0].network);
          setSelectedNetmask(res.data[0].netmask);
        }
      }
    } catch (error) {
      message.error('获取网络列表失败');
    }
  };

  const loadGroups = async () => {
    try {
      const res = await apiService.getAllGroups();
      if (res.success && res.data) {
        setGroups(res.data);
      }
    } catch (error) {
      console.error('加载分组失败:', error);
    }
  };

  const handleScan = async () => {
    if (!selectedNetwork || !selectedNetmask) {
      message.warning('请选择要扫描的网络');
      return;
    }

    setScanning(true);
    setScanResults([]);
    try {
      const res = await apiService.scanNetwork(selectedNetwork, selectedNetmask);
      if (res.success && res.data) {
        const aliveResults = res.data.filter(r => r.isAlive);
        setScanResults(res.data);
        message.success(`扫描完成，发现 ${aliveResults.length} 个在线设备`);
      } else {
        message.error(res.error || '扫描失败');
      }
    } catch (error) {
      message.error('扫描失败');
    } finally {
      setScanning(false);
    }
  };

  const handleBatchAdd = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要添加的设备');
      return;
    }
    form.resetFields();
    setAddModalVisible(true);
  };

  const handleSubmitAdd = async (values: any) => {
    const selectedResults = scanResults.filter(r => selectedRowKeys.includes(r.ip));

    const terminals = selectedResults.map((result, index) => ({
      name: values.name ? `${values.name}-${index + 1}` : `终端-${result.ip}`,
      ip: result.ip,
      mac: values.macs?.[index] || `00:00:00:00:00:${String(index).padStart(2, '0')}`,
      model: values.model || 'SC-2024',
      firmwareVersion: values.firmwareVersion || 'v1.0.0',
      groupId: values.groupId,
      status: TerminalStatus.ONLINE
    }));

    try {
      const res = await apiService.batchAddTerminals(terminals);
      if (res.success && res.data) {
        message.success(`成功添加 ${res.data.created.length} 个终端，失败 ${res.data.errors.length} 个`);
        setAddModalVisible(false);
        setSelectedRowKeys([]);
      } else {
        message.error(res.error || '添加失败');
      }
    } catch (error) {
      message.error('添加失败');
    }
  };

  const columns = [
    {
      title: 'IP地址',
      dataIndex: 'ip',
      key: 'ip',
      width: 150
    },
    {
      title: '主机名',
      dataIndex: 'hostname',
      key: 'hostname',
      render: (hostname: string) => hostname || '-'
    },
    {
      title: '响应时间',
      dataIndex: 'responseTime',
      key: 'responseTime',
      width: 120,
      render: (time: number | undefined) => time ? `${time}ms` : '-'
    },
    {
      title: '状态',
      dataIndex: 'isAlive',
      key: 'isAlive',
      width: 100,
      render: (isAlive: boolean) => (
        <Tag icon={isAlive ? <CheckCircleOutlined /> : <CloseCircleOutlined />} color={isAlive ? 'success' : 'default'}>
          {isAlive ? '在线' : '离线'}
        </Tag>
      )
    }
  ];

  const aliveResults = scanResults.filter(r => r.isAlive);

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
    getCheckboxProps: (record: NetworkScanResult) => ({
      disabled: !record.isAlive
    })
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">终端发现</h2>
        <Space className="card-actions">
          {selectedRowKeys.length > 0 && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleBatchAdd}>
              批量添加 ({selectedRowKeys.length})
            </Button>
          )}
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Select
              placeholder="选择网络"
              style={{ width: '100%' }}
              value={selectedNetwork}
              onChange={(value) => {
                const net = networks.find(n => n.network === value);
                setSelectedNetwork(value);
                if (net) setSelectedNetmask(net.netmask);
              }}
            >
              {networks.map(net => (
                <Option key={net.network} value={net.network}>
                  {net.network}/{net.netmask}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={16} style={{ textAlign: 'right' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadNetworks}>
                刷新网络
              </Button>
              <Button
                type="primary"
                icon={<ScanOutlined />}
                onClick={handleScan}
                loading={scanning}
                size="large"
              >
                {scanning ? '扫描中...' : '开始扫描'}
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {scanResults.length > 0 && (
        <Card
          title={
            <Space>
              <span>扫描结果</span>
              <Tag color="green">在线: {aliveResults.length}</Tag>
              <Tag color="default">离线: {scanResults.length - aliveResults.length}</Tag>
            </Space>
          }
          extra={`共 ${scanResults.length} 个设备`}
        >
          <Table
            columns={columns}
            dataSource={scanResults}
            rowKey="ip"
            rowSelection={rowSelection}
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 个设备`
            }}
            size="middle"
          />
        </Card>
      )}

      {scanResults.length === 0 && !scanning && (
        <Card style={{ textAlign: 'center', padding: '60px 0' }}>
          <ScanOutlined style={{ fontSize: 64, color: '#d9d9d9', marginBottom: 16 }} />
          <p style={{ color: '#999', fontSize: 16 }}>点击上方"开始扫描"按钮发现局域网设备</p>
        </Card>
      )}

      <Modal
        title="批量添加终端"
        open={addModalVisible}
        onCancel={() => setAddModalVisible(false)}
        footer={null}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmitAdd}>
          <p>已选择 {selectedRowKeys.length} 个在线设备</p>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="终端名称前缀"
                tooltip="留空则使用IP作为名称"
              >
                <Input placeholder="例如: 车间A" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="model" label="终端型号">
                <Input placeholder="例如: SC-2024" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firmwareVersion" label="固件版本">
                <Input placeholder="例如: v1.0.0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="groupId" label="所属分组">
                <Select placeholder="请选择分组" allowClear>
                  {groups.map(group => (
                    <Option key={group.id} value={group.id}>{group.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="autoGenerate"
            valuePropName="checked"
            initialValue={true}
          >
            <Checkbox disabled>自动生成MAC地址和序列号</Checkbox>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setAddModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认添加</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TerminalDiscover;
