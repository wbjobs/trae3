import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Modal,
  Form,
  Tag,
  Space,
  Popconfirm,
  message,
  Card,
  Row,
  Col,
  Avatar
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  GroupOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../services/apiClient';
import { TerminalStatus } from '@shared/types';
import type { Terminal, TerminalGroup } from '@shared/types';

const { Search } = Input;
const { Option } = Select;

const TerminalList: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [groups, setGroups] = useState<TerminalGroup[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [searchText, setSearchText] = useState('');
  const [filterGroup, setFilterGroup] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<TerminalStatus | undefined>();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<Terminal | null>(null);
  const [form] = Form.useForm();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);

  const loadTerminals = async () => {
    setLoading(true);
    try {
      const res = await apiService.getTerminals({
        page: pagination.current,
        pageSize: pagination.pageSize,
        groupId: filterGroup,
        status: filterStatus,
        keyword: searchText
      });
      if (res.success && res.data) {
        setTerminals(res.data.items);
        setPagination(prev => ({ ...prev, total: res.data!.total }));
      }
    } catch (error) {
      message.error('加载终端列表失败');
    } finally {
      setLoading(false);
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

  useEffect(() => {
    loadTerminals();
    loadGroups();
  }, [pagination.current, pagination.pageSize, filterGroup, filterStatus, searchText]);

  useEffect(() => {
    setPagination(prev => ({ ...prev, current: 1 }));
  }, [filterGroup, filterStatus, searchText]);

  const handleAdd = () => {
    setEditingTerminal(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (terminal: Terminal) => {
    setEditingTerminal(terminal);
    form.setFieldsValue({
      name: terminal.name,
      ip: terminal.ip,
      mac: terminal.mac,
      model: terminal.model,
      firmwareVersion: terminal.firmwareVersion,
      groupId: terminal.groupId,
      status: terminal.status
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await apiService.deleteTerminal(id);
      if (res.success) {
        message.success('删除成功');
        loadTerminals();
      } else {
        message.error(res.error || '删除失败');
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingTerminal) {
        const res = await apiService.updateTerminal(editingTerminal.id, values);
        if (res.success) {
          message.success('更新成功');
        } else {
          message.error(res.error || '更新失败');
          return;
        }
      } else {
        const res = await apiService.createTerminal(values);
        if (res.success) {
          message.success('创建成功');
        } else {
          message.error(res.error || '创建失败');
          return;
        }
      }
      setModalVisible(false);
      loadTerminals();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleBatchMove = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要移动的终端');
      return;
    }
    try {
      const res = await apiService.batchMoveTerminals(
        selectedRowKeys.map(k => k.toString()),
        targetGroupId
      );
      if (res.success) {
        message.success(`成功移动 ${selectedRowKeys.length} 个终端`);
        setMoveModalVisible(false);
        setSelectedRowKeys([]);
        loadTerminals();
      } else {
        message.error(res.error || '移动失败');
      }
    } catch (error) {
      message.error('移动失败');
    }
  };

  const getStatusTag = (status: TerminalStatus) => {
    const statusMap: Record<TerminalStatus, { color: string; text: string }> = {
      [TerminalStatus.ONLINE]: { color: 'success', text: '在线' },
      [TerminalStatus.OFFLINE]: { color: 'default', text: '离线' },
      [TerminalStatus.UPGRADING]: { color: 'processing', text: '升级中' },
      [TerminalStatus.ERROR]: { color: 'error', text: '异常' }
    };
    return <Tag color={statusMap[status].color}>{statusMap[status].text}</Tag>;
  };

  const columns = [
    {
      title: '终端名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Terminal) => (
        <Space>
          <Avatar size="small" style={{ backgroundColor: '#1677ff' }}>
            {text.charAt(0).toUpperCase()}
          </Avatar>
          {text}
        </Space>
      )
    },
    {
      title: 'IP地址',
      dataIndex: 'ip',
      key: 'ip'
    },
    {
      title: 'MAC地址',
      dataIndex: 'mac',
      key: 'mac'
    },
    {
      title: '型号',
      dataIndex: 'model',
      key: 'model'
    },
    {
      title: '固件版本',
      dataIndex: 'firmwareVersion',
      key: 'firmwareVersion'
    },
    {
      title: '分组',
      dataIndex: 'groupId',
      key: 'groupId',
      render: (groupId: string | undefined) => {
        const group = groups.find(g => g.id === groupId);
        return group ? <Tag color="blue">{group.name}</Tag> : <Tag color="default">未分组</Tag>;
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: TerminalStatus) => getStatusTag(status)
    },
    {
      title: '最后在线',
      dataIndex: 'lastSeen',
      key: 'lastSeen',
      render: (date: Date) => dayjs(date).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: Terminal) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个终端吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">终端管理</h2>
        <Space className="card-actions">
          {selectedRowKeys.length > 0 && (
            <Button icon={<GroupOutlined />} onClick={() => setMoveModalVisible(true)}>
              移动分组 ({selectedRowKeys.length})
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加终端
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Search
              placeholder="搜索终端名称/IP/MAC"
              allowClear
              enterButton={<SearchOutlined />}
              onSearch={(value) => setSearchText(value)}
              onChange={(e) => !e.target.value && setSearchText('')}
            />
          </Col>
          <Col xs={24} sm={8} md={5}>
            <Select
              placeholder="按分组筛选"
              allowClear
              style={{ width: '100%' }}
              value={filterGroup}
              onChange={(value) => setFilterGroup(value)}
            >
              {groups.map(group => (
                <Option key={group.id} value={group.id}>{group.name}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={8} md={5}>
            <Select
              placeholder="按状态筛选"
              allowClear
              style={{ width: '100%' }}
              value={filterStatus}
              onChange={(value) => setFilterStatus(value)}
            >
              <Option value={TerminalStatus.ONLINE}>在线</Option>
              <Option value={TerminalStatus.OFFLINE}>离线</Option>
              <Option value={TerminalStatus.UPGRADING}>升级中</Option>
              <Option value={TerminalStatus.ERROR}>异常</Option>
            </Select>
          </Col>
          <Col xs={24} sm={24} md={8} style={{ textAlign: 'right' }}>
            <Button icon={<ReloadOutlined />} onClick={loadTerminals} loading={loading}>
              刷新
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        columns={columns}
        dataSource={terminals}
        rowKey="id"
        loading={loading}
        rowSelection={rowSelection}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条记录`,
          onChange: (page, pageSize) => setPagination(prev => ({ ...prev, current: page, pageSize }))
        }}
      />

      <Modal
        title={editingTerminal ? '编辑终端' : '添加终端'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="终端名称"
            rules={[{ required: true, message: '请输入终端名称' }]}
          >
            <Input placeholder="请输入终端名称" />
          </Form.Item>
          <Form.Item
            name="ip"
            label="IP地址"
            rules={[
              { required: true, message: '请输入IP地址' },
              { pattern: /^(\d{1,3}\.){3}\d{1,3}$/, message: '请输入有效的IP地址' }
            ]}
          >
            <Input placeholder="例如: 192.168.1.100" />
          </Form.Item>
          <Form.Item
            name="mac"
            label="MAC地址"
            rules={[
              { required: true, message: '请输入MAC地址' },
              { pattern: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, message: '请输入有效的MAC地址' }
            ]}
          >
            <Input placeholder="例如: 00:1A:2B:3C:4D:5E" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="model"
                label="终端型号"
                rules={[{ required: true, message: '请输入终端型号' }]}
              >
                <Input placeholder="例如: SC-2024" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="firmwareVersion"
                label="固件版本"
                rules={[{ required: true, message: '请输入固件版本' }]}
              >
                <Input placeholder="例如: v1.2.3" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="groupId" label="所属分组">
                <Select placeholder="请选择分组" allowClear>
                  {groups.map(group => (
                    <Option key={group.id} value={group.id}>{group.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="status"
                label="终端状态"
                initialValue={TerminalStatus.OFFLINE}
              >
                <Select>
                  <Option value={TerminalStatus.ONLINE}>在线</Option>
                  <Option value={TerminalStatus.OFFLINE}>离线</Option>
                  <Option value={TerminalStatus.UPGRADING}>升级中</Option>
                  <Option value={TerminalStatus.ERROR}>异常</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                {editingTerminal ? '更新' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="移动到分组"
        open={moveModalVisible}
        onCancel={() => setMoveModalVisible(false)}
        onOk={handleBatchMove}
        okText="确定移动"
      >
        <p>已选择 {selectedRowKeys.length} 个终端</p>
        <Select
          placeholder="请选择目标分组"
          style={{ width: '100%', marginTop: 16 }}
          allowClear
          value={targetGroupId}
          onChange={setTargetGroupId}
        >
          <Option value={null}>移出分组（未分组）</Option>
          {groups.map(group => (
            <Option key={group.id} value={group.id}>{group.name}</Option>
          ))}
        </Select>
      </Modal>
    </div>
  );
};

export default TerminalList;
