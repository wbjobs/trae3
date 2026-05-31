import React, { useState } from 'react';
import {
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Card,
  Row,
  Col,
  Space,
  Tabs,
  Slider,
  Switch,
  Tag,
  message,
  Upload,
  Modal,
} from 'antd';
import {
  PlusOutlined,
  MinusCircleOutlined,
  UploadOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { taskAPI } from '../services/api';
import { PhaseType } from '../types';

const { Option } = Select;
const { TextArea } = Input;

const TaskConfig: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchTasks, setBatchTasks] = useState<any[]>([]);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const parameters = {
        domain: values.domain,
        mesh: values.mesh,
        phases: values.phases,
        boundaryConditions: values.boundaryConditions,
        simulation: values.simulation,
      };

      await taskAPI.create({
        name: values.name,
        description: values.description,
        parameters,
        createdBy: 'current-user',
        priority: values.priority,
        tags: values.tags?.split(',').map((t: string) => t.trim()),
        numChunks: values.numChunks,
      });

      message.success('任务创建成功！');
      navigate('/tasks');
    } catch (error) {
      message.error('任务创建失败，请重试');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchSubmit = async () => {
    if (batchTasks.length === 0) {
      message.warning('请先上传或添加批量任务');
      return;
    }

    setLoading(true);
    try {
      await taskAPI.batchCreate(batchTasks);
      message.success(`成功提交 ${batchTasks.length} 个任务！`);
      setBatchModalVisible(false);
      setBatchTasks([]);
      navigate('/tasks');
    } catch (error) {
      message.error('批量任务提交失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const tasks = JSON.parse(content);
        if (Array.isArray(tasks)) {
          setBatchTasks(tasks);
          message.success(`成功加载 ${tasks.length} 个任务`);
        } else {
          message.error('文件格式错误，请提供任务数组');
        }
      } catch (err) {
        message.error('文件解析失败');
      }
    };
    reader.readAsText(file);
    return false;
  };

  const defaultValues = {
    name: '',
    description: '',
    priority: 5,
    numChunks: 4,
    domain: {
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 5,
      zMin: 0,
      zMax: 2,
    },
    mesh: {
      xCells: 100,
      yCells: 50,
      zCells: 20,
      refinementLevel: 0,
    },
    phases: [
      {
        type: PhaseType.LIQUID,
        name: 'water',
        density: 998,
        viscosity: 1e-6,
        volumeFraction: 1,
      },
    ],
    boundaryConditions: {
      inlet: {
        velocity: { x: 1, y: 0, z: 0 },
        pressure: 0,
      },
      outlet: {
        pressure: 0,
      },
    },
    simulation: {
      startTime: 0,
      endTime: 10,
      timeStep: 0.01,
      writeInterval: 100,
      solver: 'interFoam',
      turbulenceModel: 'k-epsilon',
    },
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2>新建计算任务</h2>
        <Space>
          <Button onClick={() => setBatchModalVisible(true)} icon={<CloudUploadOutlined />}>
            批量提交
          </Button>
          <Button onClick={() => navigate('/tasks')}>返回列表</Button>
        </Space>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={defaultValues}
        onFinish={handleSubmit}
        className="task-form"
      >
        <Tabs defaultActiveKey="basic">
          <Tabs.TabPane tab="基本信息" key="basic">
            <Card>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="name"
                    label="任务名称"
                    rules={[{ required: true, message: '请输入任务名称' }]}
                  >
                    <Input placeholder="请输入任务名称" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="tags" label="标签 (逗号分隔)">
                    <Input placeholder="例如: 两相流, 测试, 高速" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="priority"
                    label="优先级"
                    rules={[{ required: true, message: '请选择优先级' }]}
                  >
                    <Slider min={1} max={10} marks={{ 1: '低', 5: '中', 10: '高' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="numChunks"
                    label="分片数量"
                    rules={[{ required: true, message: '请设置分片数量' }]}
                  >
                    <InputNumber min={1} max={64} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="description" label="任务描述">
                <TextArea rows={3} placeholder="请输入任务描述" />
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          <Tabs.TabPane tab="计算域设置" key="domain">
            <Card title="计算域范围">
              <div className="domain-grid">
                <Form.Item name={['domain', 'xMin']} label="X 最小值">
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['domain', 'yMin']} label="Y 最小值">
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['domain', 'zMin']} label="Z 最小值">
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['domain', 'xMax']} label="X 最大值">
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['domain', 'yMax']} label="Y 最大值">
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['domain', 'zMax']} label="Z 最大值">
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
              </div>
            </Card>

            <Card title="网格设置" style={{ marginTop: 16 }}>
              <div className="mesh-grid">
                <Form.Item name={['mesh', 'xCells']} label="X 方向网格数">
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['mesh', 'yCells']} label="Y 方向网格数">
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name={['mesh', 'zCells']} label="Z 方向网格数">
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <Form.Item name={['mesh', 'refinementLevel']} label="网格细化级别">
                <Slider min={0} max={5} />
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          <Tabs.TabPane tab="相设置" key="phases">
            <Card>
              <Form.List name="phases">
                {(fields, { add, remove }) => (
                  <>
                    <div className="phase-list">
                      {fields.map(({ key, name, ...restField }) => (
                        <div key={key} className="phase-item">
                          <Row gutter={16} align="middle">
                            <Col span={5}>
                              <Form.Item
                                {...restField}
                                name={[name, 'name']}
                                label="相名称"
                                rules={[{ required: true }]}
                              >
                                <Input placeholder="如: water, air" />
                              </Form.Item>
                            </Col>
                            <Col span={4}>
                              <Form.Item
                                {...restField}
                                name={[name, 'type']}
                                label="相类型"
                                rules={[{ required: true }]}
                              >
                                <Select>
                                  <Option value={PhaseType.GAS}>气体</Option>
                                  <Option value={PhaseType.LIQUID}>液体</Option>
                                  <Option value={PhaseType.SOLID}>固体</Option>
                                  <Option value={PhaseType.MIXTURE}>混合物</Option>
                                </Select>
                              </Form.Item>
                            </Col>
                            <Col span={4}>
                              <Form.Item
                                {...restField}
                                name={[name, 'density']}
                                label="密度 (kg/m³)"
                                rules={[{ required: true }]}
                              >
                                <InputNumber min={0} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col span={4}>
                              <Form.Item
                                {...restField}
                                name={[name, 'viscosity']}
                                label="粘度 (m²/s)"
                                rules={[{ required: true }]}
                              >
                                <InputNumber min={0} step={1e-8} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col span={4}>
                              <Form.Item
                                {...restField}
                                name={[name, 'volumeFraction']}
                                label="体积分数"
                                rules={[{ required: true }]}
                              >
                                <InputNumber min={0} max={1} step={0.01} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col span={2}>
                              {fields.length > 1 && (
                                <MinusCircleOutlined
                                  onClick={() => remove(name)}
                                  style={{ color: '#ff4d4f' }}
                                />
                              )}
                            </Col>
                          </Row>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="dashed"
                      onClick={() => add()}
                      block
                      icon={<PlusOutlined />}
                    >
                      添加相
                    </Button>
                  </>
                )}
              </Form.List>
            </Card>
          </Tabs.TabPane>

          <Tabs.TabPane tab="边界条件" key="boundary">
            <Card title="入口边界">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name={['boundaryConditions', 'inlet', 'velocity', 'x']} label="X 方向速度">
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name={['boundaryConditions', 'inlet', 'velocity', 'y']} label="Y 方向速度">
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name={['boundaryConditions', 'inlet', 'velocity', 'z']} label="Z 方向速度">
                    <InputNumber style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card title="出口边界" style={{ marginTop: 16 }}>
              <Form.Item name={['boundaryConditions', 'outlet', 'pressure']} label="出口压力">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          <Tabs.TabPane tab="求解器设置" key="solver">
            <Card>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name={['simulation', 'solver']}
                    label="求解器"
                    rules={[{ required: true }]}
                  >
                    <Select>
                      <Option value="simpleFoam">simpleFoam (定常流动)</Option>
                      <Option value="pimpleFoam">pimpleFoam (非定常流动)</Option>
                      <Option value="interFoam">interFoam (两相流)</Option>
                      <Option value="reactingFoam">reactingFoam (反应流)</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name={['simulation', 'turbulenceModel']}
                    label="湍流模型"
                    rules={[{ required: true }]}
                  >
                    <Select>
                      <Option value="laminar">层流</Option>
                      <Option value="k-epsilon">k-epsilon</Option>
                      <Option value="k-omega">k-omega</Option>
                      <Option value="LES">大涡模拟</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={6}>
                  <Form.Item
                    name={['simulation', 'startTime']}
                    label="起始时间"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    name={['simulation', 'endTime']}
                    label="结束时间"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    name={['simulation', 'timeStep']}
                    label="时间步长"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={1e-6} step={1e-4} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    name={['simulation', 'writeInterval']}
                    label="写入间隔 (步)"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Tabs.TabPane>
        </Tabs>

        <Form.Item style={{ marginTop: 24, textAlign: 'right' }}>
          <Space>
            <Button onClick={() => navigate('/tasks')}>取消</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              提交任务
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <Modal
        title="批量提交任务"
        open={batchModalVisible}
        onCancel={() => setBatchModalVisible(false)}
        onOk={handleBatchSubmit}
        okText="提交所有任务"
        confirmLoading={loading}
        width={800}
      >
        <Upload
          accept=".json"
          beforeUpload={handleBatchFileUpload}
          showUploadList={false}
        >
          <div className="batch-upload-area">
            <UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            <p style={{ marginTop: 16 }}>点击或拖拽上传任务配置文件 (.json)</p>
            <p style={{ color: '#999', fontSize: 12 }}>支持包含任务数组的 JSON 文件</p>
          </div>
        </Upload>

        {batchTasks.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h4>已加载 {batchTasks.length} 个任务:</h4>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {batchTasks.map((task, index) => (
                <div
                  key={index}
                  style={{
                    padding: 12,
                    background: '#f5f5f5',
                    marginBottom: 8,
                    borderRadius: 4,
                  }}
                >
                  <Space>
                    <Tag color="blue">{index + 1}</Tag>
                    <span>{task.name}</span>
                    <Tag>{task.numChunks || 4} 分片</Tag>
                  </Space>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TaskConfig;
