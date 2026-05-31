import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { terminalApi, Terminal } from '../services/api';

const Terminals: React.FC = () => {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<Terminal | null>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  useEffect(() => {
    loadTerminals();
  }, [pagination.current, pagination.pageSize]);

  const loadTerminals = async () => {
    setLoading(true);
    try {
      const response = await terminalApi.getTerminals({
        page: pagination.current,
        pageSize: pagination.pageSize,
      });
      setTerminals(response.data.data);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination.total,
      }));
    } catch (error) {
      message.error('加载终端列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingTerminal(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (terminal: Terminal) => {
    setEditingTerminal(terminal);
    form.setFieldsValue({
      id: terminal.id,
      name: terminal.name,
      vehicle_number: terminal.vehicle_number,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await terminalApi.deleteTerminal(id);
      message.success('删除成功');
      loadTerminals();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingTerminal) {
        await terminalApi.updateTerminal(editingTerminal.id, values);
        message.success('更新成功');
      } else {
        await terminalApi.createTerminal(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      loadTerminals();
    } catch (error) {
      message.error(editingTerminal ? '更新失败' : '创建失败');
    }
  };

  const columns = [
    {
      title: '终端ID',
      dataIndex: 'id',
      key: 'id',
      width: 200,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '车牌号',
      dataIndex: 'vehicle_number',
      key: 'vehicle_number',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'online' ? 'green' : 'red'}>
          {status === 'online' ? '在线' : '离线'}
        </Tag>
      ),
    },
    {
      title: '最后在线',
      dataIndex: 'last_online',
      key: 'last_online',
      width: 180,
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 130,
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: any, record: Terminal) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/terminals/${record.id}`)}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="删除后将同时删除该终端的所有日志"
            onConfirm={() => handleDelete(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <div style={{ marginBottom: 16, textAlign: 'right' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加终端
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={terminals}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) =>
              setPagination(prev => ({ ...prev, current: page, pageSize })),
          }}
        />
      </Card>

      <Modal
        title={editingTerminal ? '编辑终端' : '添加终端'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="确认"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="id"
            label="终端ID"
            rules={[{ required: true, message: '请输入终端ID' }]}
          >
            <Input disabled={!!editingTerminal} placeholder="请输入终端ID" />
          </Form.Item>
          <Form.Item name="name" label="终端名称">
            <Input placeholder="请输入终端名称" />
          </Form.Item>
          <Form.Item name="vehicle_number" label="车牌号">
            <Input placeholder="请输入车牌号" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Terminals;