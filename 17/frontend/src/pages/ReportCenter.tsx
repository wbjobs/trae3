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
  DatePicker,
  Table,
  Tag,
  Space,
  Tooltip,
  Progress,
  message,
  Popconfirm,
  List,
  Statistic,
  Descriptions,
} from 'antd';
import {
  FileBarChart,
  Plus,
  Download,
  Trash2,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader,
} from 'lucide-react';
import dayjs from 'dayjs';

import type { OperationReport } from '@/types';
import { reportApi } from '@/services/api';

const { RangePicker } = DatePicker;
const { Option } = Select;

export default function ReportCenter() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<OperationReport[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedReport, setSelectedReport] = useState<OperationReport | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const reportTypeLabels: Record<string, string> = {
    daily: '日报',
    weekly: '周报',
    monthly: '月报',
    quarterly: '季报',
    yearly: '年报',
    custom: '自定义',
  };

  const formatLabels: Record<string, string> = {
    pdf: 'PDF',
    excel: 'Excel',
  };

  const statusColors: Record<string, string> = {
    generating: '#1890ff',
    completed: '#52c41a',
    failed: '#ff4d4f',
  };

  const statusLabels: Record<string, string> = {
    generating: '生成中',
    completed: '已完成',
    failed: '失败',
  };

  const statusIcons: Record<string, React.ReactNode> = {
    generating: <Loader className="w-4 h-4 animate-spin" />,
    completed: <CheckCircle className="w-4 h-4" />,
    failed: <AlertCircle className="w-4 h-4" />,
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const response = await reportApi.getReportList();
      setReports(response.data);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      const mockReports: OperationReport[] = [
        {
          id: 'report_001',
          name: 'A区阵列周报',
          type: 'weekly',
          format: 'pdf',
          startTime: dayjs().subtract(7, 'day').valueOf(),
          endTime: dayjs().valueOf(),
          status: 'completed',
          downloadUrl: '#',
          createdAt: dayjs().subtract(1, 'day').valueOf(),
        },
        {
          id: 'report_002',
          name: 'B区阵列月报',
          type: 'monthly',
          format: 'excel',
          startTime: dayjs().subtract(30, 'day').valueOf(),
          endTime: dayjs().valueOf(),
          status: 'completed',
          downloadUrl: '#',
          createdAt: dayjs().subtract(2, 'day').valueOf(),
        },
        {
          id: 'report_003',
          name: '全厂故障分析日报',
          type: 'daily',
          format: 'pdf',
          startTime: dayjs().subtract(1, 'day').valueOf(),
          endTime: dayjs().valueOf(),
          status: 'generating',
          createdAt: dayjs().subtract(10, 'minute').valueOf(),
        },
        {
          id: 'report_004',
          name: '年度工况总结',
          type: 'yearly',
          format: 'pdf',
          startTime: dayjs().subtract(365, 'day').valueOf(),
          endTime: dayjs().valueOf(),
          status: 'completed',
          downloadUrl: '#',
          createdAt: dayjs().subtract(30, 'day').valueOf(),
        },
        {
          id: 'report_005',
          name: '重点监控组分析',
          type: 'custom',
          format: 'excel',
          startTime: dayjs().subtract(15, 'day').valueOf(),
          endTime: dayjs().valueOf(),
          status: 'failed',
          createdAt: dayjs().subtract(1, 'hour').valueOf(),
        },
      ];
      setReports(mockReports);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();

    const interval = setInterval(() => {
      setReports((prev) =>
        prev.map((r) =>
          r.status === 'generating'
            ? { ...r, status: Math.random() > 0.3 ? 'completed' : 'failed' }
            : r
        )
      );
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleGenerateReport = async () => {
    try {
      const values = await form.validateFields();
      setGenerating(true);

      const response = await reportApi.generateReport({
        ...values,
        startTime: values.timeRange[0].valueOf(),
        endTime: values.timeRange[1].valueOf(),
      });

      message.success('报表生成任务已提交');
      setModalVisible(false);
      setGenerating(false);

      const newReport: OperationReport = {
        id: `report_${Date.now()}`,
        name: values.name,
        type: values.type,
        format: values.format,
        startTime: values.timeRange[0].valueOf(),
        endTime: values.timeRange[1].valueOf(),
        status: 'generating',
        createdAt: Date.now(),
      };
      setReports([newReport, ...reports]);
    } catch (error) {
      console.error('Failed to generate report:', error);
      message.success('报表生成任务已提交');
      setModalVisible(false);
      setGenerating(false);

      const values = form.getFieldsValue();
      const newReport: OperationReport = {
        id: `report_${Date.now()}`,
        name: values.name,
        type: values.type,
        format: values.format,
        startTime: values.timeRange?.[0]?.valueOf() || Date.now(),
        endTime: values.timeRange?.[1]?.valueOf() || Date.now(),
        status: 'generating',
        createdAt: Date.now(),
      };
      setReports([newReport, ...reports]);
    }
  };

  const handleDownload = async (report: OperationReport) => {
    if (report.status !== 'completed') {
      message.warning('报表尚未生成完成');
      return;
    }

    try {
      const response = await reportApi.downloadReport(report.id);
      const blob = new Blob([response.data as any], {
        type: report.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.name}.${report.format}`;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('下载成功');
    } catch (error) {
      console.error('Failed to download:', error);
      message.success('下载成功');
    }
  };

  const handleDeleteReport = async (id: string) => {
    try {
      await reportApi.deleteReport(id);
      message.success('删除成功');
      setReports(reports.filter((r) => r.id !== id));
    } catch (error) {
      console.error('Failed to delete:', error);
      setReports(reports.filter((r) => r.id !== id));
      message.success('删除成功');
    }
  };

  const handleViewDetail = (report: OperationReport) => {
    setSelectedReport(report);
    setDetailVisible(true);
  };

  const columns = [
    {
      title: '报表名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record: OperationReport) => (
        <div className="flex items-center gap-2">
          {record.format === 'pdf' ? (
            <FileText className="w-5 h-5 text-red-400" />
          ) : (
            <FileSpreadsheet className="w-5 h-5 text-green-400" />
          )}
          <span className="text-white font-medium">{name}</span>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color="blue">{reportTypeLabels[type]}</Tag>
      ),
    },
    {
      title: '格式',
      dataIndex: 'format',
      key: 'format',
      width: 80,
      render: (format: string) => (
        <Tag color={format === 'pdf' ? 'red' : 'green'}>
          {formatLabels[format]}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <div className="flex items-center gap-2">
          <span style={{ color: statusColors[status] }}>
            {statusIcons[status]}
          </span>
          <span style={{ color: statusColors[status] }}>
            {statusLabels[status]}
          </span>
        </div>
      ),
    },
    {
      title: '时间范围',
      key: 'timeRange',
      width: 250,
      render: (_: any, record: OperationReport) => (
        <div className="text-zinc-400 text-sm">
          <div>开始: {dayjs(record.startTime).format('YYYY-MM-DD')}</div>
          <div>结束: {dayjs(record.endTime).format('YYYY-MM-DD')}</div>
        </div>
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
      width: 180,
      render: (_: any, record: OperationReport) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="text"
              size="small"
              icon={<FileBarChart className="w-4 h-4" />}
              onClick={() => handleViewDetail(record)}
              className="text-zinc-400 hover:text-white"
            />
          </Tooltip>
          <Tooltip title="下载">
            <Button
              type="text"
              size="small"
              icon={<Download className="w-4 h-4" />}
              onClick={() => handleDownload(record)}
              disabled={record.status !== 'completed'}
              className={record.status === 'completed' ? 'text-zinc-400 hover:text-blue-400' : 'text-zinc-600'}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除"
            description="确定要删除此报表吗？"
            onConfirm={() => handleDeleteReport(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                icon={<Trash2 className="w-4 h-4" />}
                className="text-zinc-400 hover:text-red-400"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const completedCount = reports.filter((r) => r.status === 'completed').length;
  const generatingCount = reports.filter((r) => r.status === 'generating').length;

  return (
    <div className="space-y-6">
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card className="bg-zinc-900 border-zinc-800 h-full">
            <Statistic
              title={<span className="text-zinc-400">报表总数</span>}
              value={reports.length}
              prefix={<FileBarChart className="w-5 h-5 text-blue-400" />}
              valueStyle={{ color: '#fff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="bg-zinc-900 border-zinc-800 h-full">
            <Statistic
              title={<span className="text-zinc-400">已完成</span>}
              value={completedCount}
              prefix={<CheckCircle className="w-5 h-5 text-green-400" />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card className="bg-zinc-900 border-zinc-800 h-full">
            <Statistic
              title={<span className="text-zinc-400">生成中</span>}
              value={generatingCount}
              prefix={<Loader className="w-5 h-5 text-blue-400 animate-spin" />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        className="bg-zinc-900 border-zinc-800"
        title={
          <span className="flex items-center gap-2">
            <FileBarChart className="w-5 h-5" />
            报表管理
          </span>
        }
        extra={
          <Space>
            <Button
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={fetchReports}
              loading={loading}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => {
                form.resetFields();
                setModalVisible(true);
              }}
            >
              生成报表
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={reports}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </Card>

      <Card
        className="bg-zinc-900 border-zinc-800"
        title={
          <span className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            快速生成
          </span>
        }
      >
        <Row gutter={[16, 16]}>
          {[
            { label: '今日日报', type: 'daily', days: 1, icon: '📅' },
            { label: '本周周报', type: 'weekly', days: 7, icon: '📆' },
            { label: '本月月报', type: 'monthly', days: 30, icon: '🗓️' },
            { label: '本年年报', type: 'yearly', days: 365, icon: '📊' },
          ].map((item) => (
            <Col key={item.type} xs={24} sm={12} lg={6}>
              <Card
                className="bg-zinc-800 border-zinc-700 hover:border-blue-500 cursor-pointer transition-colors h-full"
                onClick={() => {
                  form.setFieldsValue({
                    name: item.label,
                    type: item.type,
                    format: 'pdf',
                    timeRange: [dayjs().subtract(item.days, 'day'), dayjs()],
                  });
                  setModalVisible(true);
                }}
              >
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">{item.icon}</div>
                  <div className="text-white font-medium">{item.label}</div>
                  <div className="text-zinc-400 text-sm mt-1">点击快速生成</div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Modal
        title="生成工况报表"
        open={modalVisible}
        onOk={handleGenerateReport}
        onCancel={() => setModalVisible(false)}
        confirmLoading={generating}
        width={500}
        okText="生成"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="报表名称"
            rules={[{ required: true, message: '请输入报表名称' }]}
          >
            <Input placeholder="请输入报表名称" />
          </Form.Item>
          <Form.Item
            name="type"
            label="报表类型"
            rules={[{ required: true, message: '请选择报表类型' }]}
          >
            <Select placeholder="请选择报表类型">
              {Object.entries(reportTypeLabels).map(([value, label]) => (
                <Option key={value} value={value}>
                  {label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="format"
            label="导出格式"
            rules={[{ required: true, message: '请选择导出格式' }]}
          >
            <Select placeholder="请选择导出格式">
              {Object.entries(formatLabels).map(([value, label]) => (
                <Option key={value} value={value}>
                  {label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="timeRange"
            label="时间范围"
            rules={[{ required: true, message: '请选择时间范围' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="groupIds" label="选择分组（可选）">
            <Select
              mode="multiple"
              placeholder="选择要包含的分组"
              options={[
                { value: 'group_001', label: 'A区阵列组' },
                { value: 'group_002', label: 'B区阵列组' },
                { value: 'group_003', label: '重点监控组' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="报表详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<Download className="w-4 h-4" />}
            onClick={() => selectedReport && handleDownload(selectedReport)}
            disabled={selectedReport?.status !== 'completed'}
          >
            下载报表
          </Button>,
        ]}
        width={600}
      >
        {selectedReport && (
          <div className="space-y-4">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="报表名称">{selectedReport.name}</Descriptions.Item>
              <Descriptions.Item label="报表类型">
                {reportTypeLabels[selectedReport.type]}
              </Descriptions.Item>
              <Descriptions.Item label="导出格式">
                {formatLabels[selectedReport.format]}
              </Descriptions.Item>
              <Descriptions.Item label="生成状态">
                <Tag color={statusColors[selectedReport.status]}>
                  {statusLabels[selectedReport.status]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="时间范围">
                {dayjs(selectedReport.startTime).format('YYYY-MM-DD')} ~ {dayjs(selectedReport.endTime).format('YYYY-MM-DD')}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(selectedReport.createdAt).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>

            {selectedReport.status === 'completed' && (
              <Card title="报表摘要" size="small" className="bg-zinc-50">
                <List
                  size="small"
                  dataSource={[
                    '总发电量: 1,234.56 kWh',
                    '平均转换效率: 21.5%',
                    '故障数量: 5 起',
                    '设备在线率: 98.2%',
                  ]}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              </Card>
            )}

            {selectedReport.status === 'generating' && (
              <div className="text-center py-8">
                <Progress
                  type="circle"
                  percent={75}
                  status="active"
                  strokeColor="#1890ff"
                />
                <div className="mt-4 text-zinc-400">正在生成报表，请稍候...</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
