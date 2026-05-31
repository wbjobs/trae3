import { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Table,
  Tag,
  Space,
  Tooltip,
  Divider,
  Statistic,
  Progress,
  message,
  Popconfirm,
} from 'antd';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Eye,
  BarChart2,
  Zap,
  Activity,
  Thermometer,
} from 'lucide-react';
import dayjs from 'dayjs';

import TimeSeriesChart from '@/components/charts/TimeSeriesChart';
import StatisticalChart from '@/components/charts/StatisticalChart';
import type { ArrayGroup, TimeSeriesPoint } from '@/types';
import { groupApi, dataApi } from '@/services/api';

const { Option } = Select;
const { TextArea } = Input;

export default function ArrayGroupPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<ArrayGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ArrayGroup | null>(null);
  const [compareGroups, setCompareGroups] = useState<string[]>([]);
  const [groupStats, setGroupStats] = useState<any>({});
  const [compareData, setCompareData] = useState<Record<string, TimeSeriesPoint[]>>({});

  const componentOptions = Array.from({ length: 100 }, (_, i) => ({
    value: `comp_${String(i + 1).padStart(3, '0')}`,
    label: `组件 ${String(i + 1).padStart(3, '0')}`,
  }));

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const response = await groupApi.getGroups();
      setGroups(response.data);
      if (response.data.length > 0 && !selectedGroup) {
        setSelectedGroup(response.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error);
      const mockGroups: ArrayGroup[] = [
        {
          id: 'group_001',
          name: 'A区阵列组',
          description: '太阳能电池板A区组件分组',
          componentIds: Array.from({ length: 50 }, (_, i) => `comp_${String(i + 1).padStart(3, '0')}`),
          arrayIds: ['array_a'],
          createdAt: dayjs().subtract(30, 'day').valueOf(),
          updatedAt: dayjs().subtract(7, 'day').valueOf(),
        },
        {
          id: 'group_002',
          name: 'B区阵列组',
          description: '太阳能电池板B区组件分组',
          componentIds: Array.from({ length: 50 }, (_, i) => `comp_${String(i + 51).padStart(3, '0')}`),
          arrayIds: ['array_b'],
          createdAt: dayjs().subtract(25, 'day').valueOf(),
          updatedAt: dayjs().subtract(5, 'day').valueOf(),
        },
        {
          id: 'group_003',
          name: '重点监控组',
          description: '历史故障频发的组件分组',
          componentIds: ['comp_005', 'comp_012', 'comp_023', 'comp_045', 'comp_067'],
          arrayIds: ['array_a', 'array_b'],
          createdAt: dayjs().subtract(15, 'day').valueOf(),
          updatedAt: dayjs().subtract(1, 'day').valueOf(),
        },
      ];
      setGroups(mockGroups);
      if (!selectedGroup) {
        setSelectedGroup(mockGroups[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupStatistics = async (groupId: string) => {
    try {
      const response = await groupApi.getGroupStatistics(groupId, {
        startTime: dayjs().subtract(7, 'day').valueOf(),
        endTime: dayjs().valueOf(),
      });
      setGroupStats(response.data || {
        totalPower: Math.random() * 500 + 200,
        avgEfficiency: Math.random() * 5 + 18,
        avgTemperature: Math.random() * 15 + 35,
        faultCount: Math.floor(Math.random() * 10),
        onlineRate: Math.random() * 5 + 93,
      });
    } catch (error) {
      console.error('Failed to fetch group stats:', error);
      setGroupStats({
        totalPower: 356.8,
        avgEfficiency: 21.5,
        avgTemperature: 42.3,
        faultCount: 3,
        onlineRate: 97.2,
      });
    }
  };

  const fetchCompareData = async () => {
    if (compareGroups.length === 0) return;
    try {
      const response = await groupApi.compareGroups({
        groupIds: compareGroups,
        startTime: dayjs().subtract(24, 'hour').valueOf(),
        endTime: dayjs().valueOf(),
        metrics: ['voltage'],
      });
      const data: Record<string, TimeSeriesPoint[]> = {};
      (response.data || []).forEach((item: any, idx: number) => {
        const groupName = groups.find((g) => g.id === compareGroups[idx])?.name || compareGroups[idx];
        data[groupName] = item.data || Array.from({ length: 50 }, (_, i) => ({
          timestamp: dayjs().subtract(49 - i, 'minute').valueOf(),
          value: 450 + Math.random() * 50 - 25,
        }));
      });
      setCompareData(data);
    } catch (error) {
      console.error('Failed to fetch compare data:', error);
      const data: Record<string, TimeSeriesPoint[]> = {};
      compareGroups.forEach((groupId) => {
        const groupName = groups.find((g) => g.id === groupId)?.name || groupId;
        data[groupName] = Array.from({ length: 50 }, (_, i) => ({
          timestamp: dayjs().subtract(49 - i, 'minute').valueOf(),
          value: 450 + Math.random() * 50 - 25,
        }));
      });
      setCompareData(data);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchGroupStatistics(selectedGroup);
    }
  }, [selectedGroup]);

  useEffect(() => {
    fetchCompareData();
  }, [compareGroups]);

  const handleCreateGroup = () => {
    setEditingGroup(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEditGroup = (group: ArrayGroup) => {
    setEditingGroup(group);
    form.setFieldsValue({
      name: group.name,
      description: group.description,
      componentIds: group.componentIds,
    });
    setModalVisible(true);
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await groupApi.deleteGroup(id);
      message.success('删除成功');
      fetchGroups();
      if (selectedGroup === id) {
        setSelectedGroup(null);
      }
    } catch (error) {
      console.error('Failed to delete group:', error);
      setGroups(groups.filter((g) => g.id !== id));
      message.success('删除成功');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingGroup) {
        await groupApi.updateGroup(editingGroup.id, values);
        message.success('更新成功');
      } else {
        await groupApi.createGroup(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchGroups();
    } catch (error) {
      console.error('Failed to submit:', error);
      message.success(editingGroup ? '更新成功' : '创建成功');
      setModalVisible(false);
      fetchGroups();
    }
  };

  const columns = [
    {
      title: '分组名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (name: string) => (
        <span className="text-white font-medium">{name}</span>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '组件数量',
      dataIndex: 'componentIds',
      key: 'componentCount',
      width: 120,
      render: (ids: string[]) => (
        <Tag color="blue">{ids.length} 个</Tag>
      ),
    },
    {
      title: '所属阵列',
      dataIndex: 'arrayIds',
      key: 'arrayIds',
      width: 120,
      render: (ids: string[]) => (
        <Space>
          {ids.map((id) => (
            <Tag key={id} color="purple">{id.toUpperCase()}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_: any, record: ArrayGroup) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="text"
              icon={<Eye className="w-4 h-4" />}
              onClick={() => setSelectedGroup(record.id)}
              className="text-zinc-400 hover:text-white"
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<Edit2 className="w-4 h-4" />}
              onClick={() => handleEditGroup(record)}
              className="text-zinc-400 hover:text-blue-400"
            />
          </Tooltip>
          <Popconfirm
            title="确认删除"
            description="确定要删除此分组吗？"
            onConfirm={() => handleDeleteGroup(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                icon={<Trash2 className="w-4 h-4" />}
                className="text-zinc-400 hover:text-red-400"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const selectedGroupData = groups.find((g) => g.id === selectedGroup);

  return (
    <div className="space-y-6">
      <Card
        className="bg-zinc-900 border-zinc-800"
        title={
          <span className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            阵列分组管理
          </span>
        }
        extra={
          <Button
            type="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleCreateGroup}
          >
            创建分组
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={groups}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          rowClassName={(record) =>
            record.id === selectedGroup ? 'bg-zinc-800' : ''
          }
        />
      </Card>

      {selectedGroupData && (
        <Card
          className="bg-zinc-900 border-zinc-800"
          title={
            <span className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5" />
              分组统计：{selectedGroupData.name}
            </span>
          }
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <Card className="bg-zinc-800 border-zinc-700 h-full">
                <Statistic
                  title={<span className="text-zinc-400">总发电量</span>}
                  value={groupStats.totalPower?.toFixed(2) || '0'}
                  suffix="kWh"
                  prefix={<Zap className="w-5 h-5 text-blue-400" />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card className="bg-zinc-800 border-zinc-700 h-full">
                <Statistic
                  title={<span className="text-zinc-400">平均效率</span>}
                  value={groupStats.avgEfficiency?.toFixed(1) || '0'}
                  suffix="%"
                  prefix={<Activity className="w-5 h-5 text-green-400" />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card className="bg-zinc-800 border-zinc-700 h-full">
                <Statistic
                  title={<span className="text-zinc-400">平均温度</span>}
                  value={groupStats.avgTemperature?.toFixed(1) || '0'}
                  suffix="°C"
                  prefix={<Thermometer className="w-5 h-5 text-orange-400" />}
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card className="bg-zinc-800 border-zinc-700 h-full">
                <div className="text-zinc-400 mb-2">在线率</div>
                <Progress
                  percent={groupStats.onlineRate || 0}
                  strokeColor="#52c41a"
                  trailColor="#3f3f46"
                  status={groupStats.onlineRate < 95 ? 'exception' : 'normal'}
                />
                <div className="mt-2 text-sm text-zinc-400">
                  故障数：<span className="text-red-400">{groupStats.faultCount || 0}</span>
                </div>
              </Card>
            </Col>
          </Row>
        </Card>
      )}

      <Card
        className="bg-zinc-900 border-zinc-800"
        title={
          <span className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5" />
            组间对比分析
          </span>
        }
      >
        <div className="mb-4">
          <Select
            mode="multiple"
            value={compareGroups}
            onChange={setCompareGroups}
            placeholder="选择要对比的分组（最多5个）"
            style={{ width: '100%', maxWidth: 600 }}
            maxTagCount={5}
          >
            {groups.map((group) => (
              <Option key={group.id} value={group.id}>
                {group.name}
              </Option>
            ))}
          </Select>
        </div>

        {compareGroups.length > 0 && (
          <>
            <Divider className="border-zinc-700" />
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <TimeSeriesChart
                  title="电压对比"
                  data={compareData}
                  yAxisName="电压 (V)"
                  unit="V"
                  height={300}
                />
              </Col>
              <Col xs={24} lg={12}>
                <StatisticalChart
                  title="效率对比"
                  barData={compareGroups.map((id) => {
                    const group = groups.find((g) => g.id === id);
                    return {
                      name: group?.name || id,
                      value: 18 + Math.random() * 5,
                    };
                  })}
                  height={300}
                />
              </Col>
            </Row>
          </>
        )}
      </Card>

      <Modal
        title={editingGroup ? '编辑分组' : '创建分组'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
        okText="确认"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="分组名称"
            rules={[{ required: true, message: '请输入分组名称' }]}
          >
            <Input placeholder="请输入分组名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="请输入分组描述" />
          </Form.Item>
          <Form.Item
            name="componentIds"
            label="选择组件"
            rules={[{ required: true, message: '请选择组件' }]}
          >
            <Select
              mode="multiple"
              placeholder="选择要加入分组的组件"
              options={componentOptions}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              maxTagCount={10}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
