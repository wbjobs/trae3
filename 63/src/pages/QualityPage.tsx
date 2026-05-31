import { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  Select,
  List,
  Badge,
  Tabs,
  Space,
  message,
  Tooltip,
  Checkbox,
  Progress,
  Statistic,
  Row,
  Col
} from 'antd';
import {
  CheckCircle,
  XCircle,
  Eye,
  AlertTriangle,
  FileText,
  Clock,
  User,
  Plus,
  Trash2,
  CheckSquare,
  XSquare,
  FileOutput,
  Download,
  BarChart3
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '../store/appStore';
import { statusLabels, statusColors, fileTypeLabels } from '../data/mockData';
import { qualityApi } from '../services/api';
import type { ArchiveMetadata, QualityIssue, QualityRecord } from '../../shared/types';

const { TextArea } = Input;
const { Option } = Select;
const { TabPane } = Tabs;

const QualityPage = () => {
  const { archives, qualityRecords, updateArchiveStatus, completeQualityCheck, batchQualityCheck, user } = useAppStore();
  const [selectedArchive, setSelectedArchive] = useState<ArchiveMetadata | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [checkResult, setCheckResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [form] = Form.useForm();
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchResultVisible, setBatchResultVisible] = useState(false);
  const [batchResult, setBatchResult] = useState<{ success: string[]; failed: string[] }>({ success: [], failed: [] });
  const [reportGenerating, setReportGenerating] = useState(false);

  const pendingArchives = archives.filter(a => a.status === 'PENDING' || a.status === 'QUALITY_CHECKING');
  const checkedArchives = archives.filter(a => a.status === 'APPROVED' || a.status === 'REJECTED');

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'red';
      case 'MAJOR': return 'orange';
      case 'MINOR': return 'blue';
      default: return 'default';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return '严重';
      case 'MAJOR': return '主要';
      case 'MINOR': return '轻微';
      default: return severity;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'FORMAT': return '格式问题';
      case 'CONTENT': return '内容问题';
      case 'METADATA': return '元数据问题';
      default: return '其他问题';
    }
  };

  const handleStartCheck = (archive: ArchiveMetadata) => {
    setSelectedArchive(archive);
    updateArchiveStatus(archive.id, 'QUALITY_CHECKING');
    setIssues([]);
    form.resetFields();
    setResultModalVisible(true);
  };

  const handleViewDetail = (archive: ArchiveMetadata) => {
    setSelectedArchive(archive);
    setModalVisible(true);
  };

  const handleAddIssue = () => {
    setIssues([
      ...issues,
      {
        id: uuidv4(),
        type: 'FORMAT',
        severity: 'MAJOR',
        description: '',
        location: ''
      }
    ]);
  };

  const handleUpdateIssue = (id: string, field: keyof QualityIssue, value: string) => {
    setIssues(issues.map(issue =>
      issue.id === id ? { ...issue, [field]: value } : issue
    ));
  };

  const handleRemoveIssue = (id: string) => {
    setIssues(issues.filter(issue => issue.id !== id));
  };

  const handleSubmitCheck = async (values: any) => {
    if (!selectedArchive) return;

    const record: QualityRecord = {
      id: uuidv4(),
      archiveId: selectedArchive.id,
      inspector: user?.name || '未知',
      checkTime: new Date().toLocaleString(),
      result: checkResult,
      comments: values.comments || '',
      issues
    };

    completeQualityCheck(selectedArchive.id, record);
    setResultModalVisible(false);
    setSelectedArchive(null);
    setIssues([]);
    message.success(checkResult === 'PASS' ? '质检通过，已归档！' : '质检驳回，已通知上传员！');
  };

  const handleBatchCheck = async (result: 'PASS' | 'FAIL') => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要审核的档案');
      return;
    }

    Modal.confirm({
      title: `批量${result === 'PASS' ? '通过' : '驳回'}`,
      content: `确定要${result === 'PASS' ? '通过' : '驳回'}选中的 ${selectedRowKeys.length} 个档案吗？`,
      onOk: async () => {
        setBatchProcessing(true);
        setBatchProgress(0);
        
        const response = await qualityApi.batchCheck({
          archiveIds: selectedRowKeys,
          result,
          inspector: user?.name || '未知',
          comments: `批量${result === 'PASS' ? '通过' : '驳回'}`
        });

        if (response.success) {
          const batchResult = batchQualityCheck(
            selectedRowKeys,
            result,
            user?.name || '未知',
            `批量${result === 'PASS' ? '通过' : '驳回'}`
          );
          setBatchResult(batchResult);
          setBatchResultVisible(true);
          message.success(
            `批量${result === 'PASS' ? '通过' : '驳回'}完成：成功 ${batchResult.success.length} 个，失败 ${batchResult.failed.length} 个`
          );
        } else {
          message.error(response.message || '批量操作失败');
        }
        
        setBatchProcessing(false);
        setSelectedRowKeys([]);
      }
    });
  };

  const handleGenerateReport = async () => {
    setReportGenerating(true);
    try {
      const response = await qualityApi.downloadReport(undefined, 'html');
      if (response.success && response.data) {
        const blob = new Blob([response.data.htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `quality-report-${response.data.reportId}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        message.success('质检报告生成成功，已开始下载');
      } else {
        message.error(response.message || '报告生成失败');
      }
    } catch (e) {
      message.error('报告生成失败');
    } finally {
      setReportGenerating(false);
    }
  };

  const handlePreviewReport = async () => {
    const response = await qualityApi.generateReport();
    if (response.success && response.data) {
      window.open(`/api/quality/report/generate?format=html`, '_blank');
    }
  };

  const handleSelectAll = () => {
    if (selectedRowKeys.length === pendingArchives.length) {
      setSelectedRowKeys([]);
    } else {
      setSelectedRowKeys(pendingArchives.map(a => a.id));
    }
  };

  const tableColumns = [
    {
      title: '项目名称',
      dataIndex: 'projectName',
      key: 'projectName',
      render: (text: string, record: ArchiveMetadata) => (
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-blue-500" />
          <span className="font-medium">{text}</span>
        </div>
      )
    },
    {
      title: '文件类型',
      dataIndex: 'fileType',
      key: 'fileType',
      width: 120,
      render: (type: string) => <Tag color="blue">{fileTypeLabels[type]}</Tag>
    },
    {
      title: '文件大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 120,
      render: (size: number) => formatFileSize(size)
    },
    {
      title: '上传人',
      dataIndex: 'uploader',
      key: 'uploader',
      width: 100,
      render: (name: string) => (
        <div className="flex items-center gap-1">
          <User size={14} className="text-gray-400" />
          <span>{name}</span>
        </div>
      )
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      width: 170,
      render: (time: string) => (
        <div className="flex items-center gap-1 text-gray-500">
          <Clock size={14} />
          <span className="text-sm">{time}</span>
        </div>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_: unknown, record: ArchiveMetadata) => (
        <Space>
          {record.status === 'PENDING' && (
            <Button
              type="primary"
              size="small"
              icon={<CheckCircle size={14} />}
              onClick={() => handleStartCheck(record)}
            >
              质检
            </Button>
          )}
          {record.status === 'QUALITY_CHECKING' && (
            <Button
              type="primary"
              size="small"
              icon={<AlertTriangle size={14} />}
              onClick={() => handleStartCheck(record)}
            >
              继续质检
            </Button>
          )}
          <Tooltip title="查看详情">
            <Button
              size="small"
              icon={<Eye size={14} />}
              onClick={() => handleViewDetail(record)}
            />
          </Tooltip>
        </Space>
      )
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys as string[]);
    },
    getCheckboxProps: (record: ArchiveMetadata) => ({
      disabled: record.status !== 'PENDING' && record.status !== 'QUALITY_CHECKING',
    }),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 m-0">质检查看</h2>
          <p className="text-gray-500 mt-1 m-0">管理待检项目并执行质量检查</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge count={pendingArchives.length} size="small">
            <span className="text-gray-600">待检项目</span>
          </Badge>
        </div>
      </div>

      <Row gutter={16}>
        <Col span={6}>
          <Card className="shadow-sm">
            <Statistic
              title="待质检"
              value={pendingArchives.length}
              prefix={<Clock size={20} className="text-orange-500" />}
              valueStyle={{ color: '#FF7D00' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="shadow-sm">
            <Statistic
              title="已通过"
              value={archives.filter(a => a.status === 'APPROVED').length}
              prefix={<CheckCircle size={20} className="text-green-500" />}
              valueStyle={{ color: '#0FC6C2' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="shadow-sm">
            <Statistic
              title="已驳回"
              value={archives.filter(a => a.status === 'REJECTED').length}
              prefix={<XCircle size={20} className="text-red-500" />}
              valueStyle={{ color: '#F53F3F' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="shadow-sm">
            <Statistic
              title="本月质检"
              value={qualityRecords.length}
              prefix={<BarChart3 size={20} className="text-purple-500" />}
              valueStyle={{ color: '#722ED1' }}
            />
          </Card>
        </Col>
      </Row>

      <Card className="shadow-sm">
        <Tabs defaultActiveKey="pending">
          <TabPane tab={`待检列表 (${pendingArchives.length})`} key="pending">
            <div className="mb-4 flex items-center justify-between bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedRowKeys.length === pendingArchives.length && pendingArchives.length > 0}
                  indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < pendingArchives.length}
                  onChange={handleSelectAll}
                >
                  全选
                </Checkbox>
                <span className="text-gray-500 text-sm">
                  已选择 <strong className="text-blue-600">{selectedRowKeys.length}</strong> 项
                </span>
              </div>
              <Space>
                <Button
                  type="primary"
                  icon={<CheckSquare size={16} />}
                  disabled={selectedRowKeys.length === 0}
                  loading={batchProcessing}
                  onClick={() => handleBatchCheck('PASS')}
                >
                  批量通过
                </Button>
                <Button
                  danger
                  icon={<XSquare size={16} />}
                  disabled={selectedRowKeys.length === 0}
                  loading={batchProcessing}
                  onClick={() => handleBatchCheck('FAIL')}
                >
                  批量驳回
                </Button>
              </Space>
            </div>

            {batchProcessing && (
              <div className="mb-4">
                <Progress
                  percent={batchProgress}
                  status="active"
                  strokeColor={{ from: '#165DFF', to: '#0FC6C2' }}
                />
              </div>
            )}

            <div className="mb-4 flex items-center justify-end gap-3">
              <Button
                icon={<FileOutput size={16} />}
                onClick={handlePreviewReport}
              >
                预览报告
              </Button>
              <Button
                type="primary"
                icon={<Download size={16} />}
                loading={reportGenerating}
                onClick={handleGenerateReport}
              >
                导出质检报告
              </Button>
            </div>

            <Table
              rowSelection={rowSelection}
              columns={tableColumns}
              dataSource={pendingArchives}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 900 }}
            />
          </TabPane>
          <TabPane tab={`已检列表 (${checkedArchives.length})`} key="checked">
            <Table
              columns={tableColumns}
              dataSource={checkedArchives}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 900 }}
            />
          </TabPane>
          <TabPane tab="质检记录" key="records">
            <List
              dataSource={qualityRecords}
              renderItem={(record) => {
                const archive = archives.find(a => a.id === record.archiveId);
                return (
                  <List.Item className="px-4 py-3 hover:bg-gray-50 rounded-lg">
                    <div className="flex items-start justify-between w-full">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          record.result === 'PASS' ? 'bg-green-100' : 'bg-red-100'
                        }`}>
                          {record.result === 'PASS'
                            ? <CheckCircle size={20} className="text-green-600" />
                            : <XCircle size={20} className="text-red-600" />
                          }
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 m-0">
                            {archive?.projectName || '未知项目'}
                          </p>
                          <p className="text-sm text-gray-500 m-0">
                            质检员：{record.inspector} · {record.checkTime}
                          </p>
                          {record.issues.length > 0 && (
                            <div className="mt-2">
                              <Space wrap>
                                {record.issues.slice(0, 3).map((issue) => (
                                  <Tag
                                    key={issue.id}
                                    color={getSeverityColor(issue.severity)}
                                  >
                                    {getTypeLabel(issue.type)}
                                  </Tag>
                                ))}
                                {record.issues.length > 3 && (
                                  <Tag>+{record.issues.length - 3} 更多</Tag>
                                )}
                              </Space>
                            </div>
                          )}
                        </div>
                      </div>
                      <Tag color={record.result === 'PASS' ? 'green' : 'red'}>
                        {record.result === 'PASS' ? '通过' : '驳回'}
                      </Tag>
                    </div>
                  </List.Item>
                );
              }}
            />
          </TabPane>
        </Tabs>
      </Card>

      <Modal
        title="档案详情"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={700}
      >
        {selectedArchive && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500">项目名称</label>
                <p className="font-medium text-gray-800 m-0">{selectedArchive.projectName}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">文件类型</label>
                <p className="font-medium text-gray-800 m-0">
                  <Tag color="blue">{fileTypeLabels[selectedArchive.fileType]}</Tag>
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500">坐标系</label>
                <p className="font-medium text-gray-800 m-0">{selectedArchive.coordinateSystem}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">比例尺</label>
                <p className="font-medium text-gray-800 m-0">{selectedArchive.scale}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">测区范围</label>
                <p className="font-medium text-gray-800 m-0">{selectedArchive.surveyArea}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">文件大小</label>
                <p className="font-medium text-gray-800 m-0">{formatFileSize(selectedArchive.fileSize)}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">上传人</label>
                <p className="font-medium text-gray-800 m-0">{selectedArchive.uploader}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">上传时间</label>
                <p className="font-medium text-gray-800 m-0">{selectedArchive.uploadTime}</p>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500">当前状态</label>
              <p className="m-0 mt-1">
                <Tag color={statusColors[selectedArchive.status]}>
                  {statusLabels[selectedArchive.status]}
                </Tag>
              </p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="质量检查"
        open={resultModalVisible}
        onCancel={() => setResultModalVisible(false)}
        width={800}
        footer={null}
      >
        {selectedArchive && (
          <Form form={form} layout="vertical" onFinish={handleSubmitCheck}>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-gray-800 m-0 mb-2">质检项目</h4>
              <p className="text-gray-600 m-0">{selectedArchive.projectName}</p>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-800 m-0">质检问题</h4>
                <Button
                  type="dashed"
                  size="small"
                  icon={<Plus size={14} />}
                  onClick={handleAddIssue}
                >
                  添加问题
                </Button>
              </div>
              
              {issues.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <AlertTriangle size={48} className="mx-auto mb-2 opacity-30" />
                  <p>暂无质检问题</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {issues.map((issue) => (
                    <Card key={issue.id} size="small" className="border-dashed">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <Select
                            size="small"
                            value={issue.type}
                            onChange={(v) => handleUpdateIssue(issue.id, 'type', v)}
                          >
                            <Option value="FORMAT">格式问题</Option>
                            <Option value="CONTENT">内容问题</Option>
                            <Option value="METADATA">元数据问题</Option>
                            <Option value="OTHER">其他问题</Option>
                          </Select>
                          <Select
                            size="small"
                            value={issue.severity}
                            onChange={(v) => handleUpdateIssue(issue.id, 'severity', v)}
                          >
                            <Option value="CRITICAL">严重</Option>
                            <Option value="MAJOR">主要</Option>
                            <Option value="MINOR">轻微</Option>
                          </Select>
                          <Input
                            size="small"
                            placeholder="问题描述"
                            value={issue.description}
                            onChange={(e) => handleUpdateIssue(issue.id, 'description', e.target.value)}
                            className="col-span-2"
                          />
                          <Input
                            size="small"
                            placeholder="位置（选填）"
                            value={issue.location}
                            onChange={(e) => handleUpdateIssue(issue.id, 'location', e.target.value)}
                            className="col-span-2"
                          />
                        </div>
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<Trash2 size={14} />}
                          onClick={() => handleRemoveIssue(issue.id)}
                        />
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <Form.Item name="comments" label="质检评语">
              <TextArea rows={3} placeholder="请输入质检评语..." />
            </Form.Item>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button onClick={() => setResultModalVisible(false)}>取消</Button>
              <Button
                danger
                icon={<XCircle size={16} />}
                onClick={() => {
                  setCheckResult('FAIL');
                  form.submit();
                }}
              >
                驳回
              </Button>
              <Button
                type="primary"
                icon={<CheckCircle size={16} />}
                onClick={() => {
                  setCheckResult('PASS');
                  form.submit();
                }}
              >
                通过
              </Button>
            </div>
          </Form>
        )}
      </Modal>

      <Modal
        title="批量审核结果"
        open={batchResultVisible}
        onCancel={() => setBatchResultVisible(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setBatchResultVisible(false)}>
            确定
          </Button>
        ]}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Card className="text-center bg-green-50">
              <Statistic
                title="成功"
                value={batchResult.success.length}
                valueStyle={{ color: '#0FC6C2' }}
                prefix={<CheckCircle size={24} />}
              />
              {batchResult.success.length > 0 && (
                <div className="mt-3 text-left text-sm text-gray-600 max-h-40 overflow-auto">
                  {batchResult.success.map(id => {
                    const archive = archives.find(a => a.id === id);
                    return <div key={id}>✓ {archive?.projectName || id}</div>;
                  })}
                </div>
              )}
            </Card>
          </Col>
          <Col span={12}>
            <Card className="text-center bg-red-50">
              <Statistic
                title="失败"
                value={batchResult.failed.length}
                valueStyle={{ color: '#F53F3F' }}
                prefix={<XCircle size={24} />}
              />
              {batchResult.failed.length > 0 && (
                <div className="mt-3 text-left text-sm text-gray-600 max-h-40 overflow-auto">
                  {batchResult.failed.map(id => {
                    const archive = archives.find(a => a.id === id);
                    return <div key={id}>✗ {archive?.projectName || id}</div>;
                  })}
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </Modal>
    </div>
  );
};

export default QualityPage;
