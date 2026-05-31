import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Input,
  Modal,
  Form,
  Tag,
  Space,
  Popconfirm,
  message,
  Card,
  Row,
  Col,
  InputNumber
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  TeamOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../services/apiClient';
import type { TerminalGroup } from '@shared/types';

const { Search } = Input;
const { TextArea } = Input;

const GroupList: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<TerminalGroup[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [searchText, setSearchText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TerminalGroup | null>(null);
  const [form] = Form.useForm();

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await apiService.getGroups({
        page: pagination.current,
        pageSize: pagination.pageSize,
        keyword: searchText
      });
      if (res.success && res.data) {
        setGroups(res.data.items);
        setPagination(prev => ({ ...prev, total: res.data!.total }));
      }
    } catch (error) {
      message.error('加载分组列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, [pagination.current, pagination.pageSize, searchText]);

  useEffect(() => {
    setPagination(prev => ({ ...prev, current: 1 }));
  }, [searchText]);

  const handleAdd = () => {
    setEditingGroup(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (group: TerminalGroup) => {
    setEditingGroup(group);
    form.setFieldsValue({
      name: group.name,
      description: group.description
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await apiService.deleteGroup(id);
      if (res.success) {
        message.success('删除成功');
        loadGroups();
      } else {
        message.error(res.error || '删除失败');
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingGroup) {
        const res = await apiService.updateGroup(editingGroup.id, values);
        if (res.success) {
          message.success('更新成功');
        } else {
          message.error(res.error || '更新失败');
          return;
        }
      } else {
        const res = await apiService.createGroup(values);
        if (res.success) {
          message.success('创建成功');
        } else {
          message.error(res.error || '创建失败');
          return;
        }
      }
      setModalVisible(false);
      loadGroups();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const columns = [
    {
      title: '分组名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <Space>
          <TeamOutlined style={{ color: '#1677ff' }} />
          <span style={{ fontWeight: 500 }}>{text}</span>
        </Space>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => text || '-'
    },
    {
      title: '终端数量',
      dataIndex: 'terminalCount',
      key: 'terminalCount',
      width: 120,
      render: (count: number) => (
        <Tag color={count > 0 ? 'blue' : 'default'}>{count} 台</Tag>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: Date) => dayjs(date).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (date: Date) => dayjs(date).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_: unknown, record: TerminalGroup) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个分组吗？"
            description="删除后分组内的终端将变为未分组状态"
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

  const statCards = [
    {
      title: '总分组数',
      value: pagination.total,
      icon: <TeamOutlined style={{ fontSize: 28, color: '#1677ff' }} />,
      color: '#1677ff'
    },
    {
      title: '已使用分组',
      value: groups.filter(g => g.terminalCount > 0).length,
      icon: <TeamOutlined style={{ fontSize: 28, color: '#52c41a' }} />,
      color: '#52c41a'
    },
    {
      title: '终端总数',
      value: groups.reduce((sum, g) => sum + g.terminalCount, 0),
      icon: <TeamOutlined style={{ fontSize: 28, color: '#722ed1' }} />,
      color: '#722ed1'
    }
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">分组管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新建分组
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {statCards.map((card, index) => (
          <Col xs={24} sm={8} key={index}>
            <Card hoverable size="small">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  background: `${card.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {card.icon}
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: card.color }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: 13, color: '#999' }}>
                    {card.title}
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Search
              placeholder="搜索分组名称/描述"
              allowClear
              enterButton={<SearchOutlined />}
              onSearch={(value) => setSearchText(value)}
              onChange={(e) => !e.target.value && setSearchText('')}
            />
          </Col>
          <Col xs={24} sm={12} md={16} style={{ textAlign: 'right' }}>
            <Button icon={<ReloadOutlined />} onClick={loadGroups} loading={loading}>
              刷新
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        columns={columns}
        dataSource={groups}
        rowKey="id"
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条记录`,
          onChange: (page, pageSize) => setPagination(prev => ({ ...prev, current: page, pageSize }))
        }}
      />

      <Modal
        title={editingGroup ? '编辑分组' : '新建分组'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="分组名称"
            rules={[{ required: true, message: '请输入分组名称' }]}
          >
            <Input placeholder="请输入分组名称，例如: 车间A" />
          </Form.Item>
          <Form.Item
            name="description"
            label="分组描述"
          >
            <TextArea rows={4} placeholder="请输入分组描述（可选）" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                {editingGroup ? '更新' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default GroupList;
