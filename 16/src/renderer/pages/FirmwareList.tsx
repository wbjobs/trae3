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
  Upload,
  Progress,
  Descriptions,
  Alert,
  Switch,
  Tooltip
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  UploadOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FileZipOutlined,
  LockOutlined,
  UnlockOutlined,
  SafetyOutlined,
  FileProtectOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../services/apiClient';
import type { Firmware, FirmwareValidationResult } from '@shared/types';
import { useCache, useDebounce } from '../hooks/useCache';

const { Search } = Input;
const { Option } = Select;
const { TextArea } = Input;

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};

const FirmwareList: React.FC = () => {
  const [firmwares, setFirmwares] = useState<Firmware[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [searchText, setSearchText] = useState('');
  const [filterModel, setFilterModel] = useState<string | undefined>();
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedFirmware, setSelectedFirmware] = useState<Firmware | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<FirmwareValidationResult | null>(null);
  const [form] = Form.useForm();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentStep, setCurrentStep] = useState('上传文件');
  const [uploadedSize, setUploadedSize] = useState('0 B');
  const [totalSize, setTotalSize] = useState('0 B');

  const { data: firmwareData, loading, refetch, clearCache } = useCache(
    `firmwares:${pagination.current}:${pagination.pageSize}:${filterModel || ''}:${searchText || ''}`,
    () => apiService.getFirmwares({
      page: pagination.current,
      pageSize: pagination.pageSize,
      model: filterModel,
      keyword: searchText
    }).then(res => {
      if (res.success && res.data) {
        return { items: res.data.items, total: res.data.total };
      }
      throw new Error(res.error || '加载失败');
    }),
    { enabled: true, ttl: 30000 }
  );

  useEffect(() => {
    if (firmwareData) {
      setFirmwares(firmwareData.items);
      setPagination(prev => ({ ...prev, total: firmwareData.total }));
    }
  }, [firmwareData]);

  const loadFirmwares = () => {
    clearCache();
    refetch();
  };

  const debouncedSearch = useDebounce(searchText, 500);

  useEffect(() => {
    if (debouncedSearch) {
      setPagination(prev => ({ ...prev, current: 1 }));
      clearCache();
    }
  }, [debouncedSearch, filterModel, clearCache]);

  const models = Array.from(new Set(firmwares.map(f => f.model)));

  const handleUpload = async (values: any) => {
    if (!selectedFile) {
      message.error('请选择固件文件');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setCurrentStep('校验文件');
    setTotalSize(formatSize(selectedFile.size));
    setUploadedSize('0 B');

    try {
      const formData = new FormData();
      formData.append('firmware', selectedFile);
      formData.append('name', values.name);
      formData.append('version', values.version);
      formData.append('model', values.model);
      formData.append('description', values.description || '');
      formData.append('uploadedBy', 'admin');
      formData.append('encrypted', String(values.encrypted || false));

      setCurrentStep('上传文件');

      const res = await apiService.uploadFirmware(formData, (percent) => {
        setUploadProgress(percent);
        const uploaded = Math.round(selectedFile.size * percent / 100);
        setUploadedSize(formatSize(uploaded));
        if (percent >= 100) {
          setCurrentStep('处理文件');
        }
      });

      if (res.success && res.data) {
        message.success('固件上传成功');
        setUploadModalVisible(false);
        setSelectedFile(null);
        form.resetFields();
        loadFirmwares();
      } else {
        message.error(res.error || '上传失败');
      }
    } catch (error) {
      message.error('上传失败');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setCurrentStep('上传文件');
      setUploadedSize('0 B');
      setTotalSize('0 B');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await apiService.deleteFirmware(id);
      if (res.success) {
        message.success('删除成功');
        loadFirmwares();
      } else {
        message.error(res.error || '删除失败');
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleValidate = async (firmware: Firmware) => {
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await apiService.validateFirmware(firmware.id);
      if (res.success && res.data) {
        setValidationResult(res.data);
        if (res.data.valid) {
          message.success('固件完整性校验通过');
        } else {
          message.error('固件完整性校验失败');
        }
      }
    } catch (error) {
      message.error('校验失败');
    } finally {
      setValidating(false);
    }
  };

  const handleViewDetail = (firmware: Firmware) => {
    setSelectedFirmware(firmware);
    setValidationResult(null);
    setDetailModalVisible(true);
  };

  const columns = [
    {
      title: '固件名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Firmware) => (
        <Space>
          <FileZipOutlined style={{ color: '#1677ff' }} />
          <a onClick={() => handleViewDetail(record)} style={{ fontWeight: 500 }}>
            {text}
          </a>
        </Space>
      )
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      render: (version: string) => (
        <Tag color="blue">{version}</Tag>
      )
    },
    {
      title: '适用型号',
      dataIndex: 'model',
      key: 'model',
      render: (model: string) => (
        <Tag>{model}</Tag>
      )
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => formatSize(size)
    },
    {
      title: '安全状态',
      dataIndex: 'encrypted',
      key: 'encrypted',
      width: 120,
      render: (_: unknown, record: Firmware) => (
        <Space>
          {record.encrypted ? (
            <Tooltip title="已加密">
              <LockOutlined style={{ color: '#52c41a' }} />
            </Tooltip>
          ) : (
            <Tooltip title="未加密">
              <UnlockOutlined style={{ color: '#999' }} />
            </Tooltip>
          )}
          {record.signature ? (
            <Tooltip title="已签名">
              <SafetyOutlined style={{ color: '#1890ff' }} />
            </Tooltip>
          ) : null}
        </Space>
      )
    },
    {
      title: 'MD5',
      dataIndex: 'md5',
      key: 'md5',
      render: (md5: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {md5.substring(0, 16)}...
        </span>
      )
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      render: (date: Date) => dayjs(date).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: Firmware) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<SafetyCertificateOutlined />}
            onClick={() => handleValidate(record)}
          >
            校验
          </Button>
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => window.open(`/api/firmwares/${record.id}/download`)}
          >
            下载
          </Button>
          <Popconfirm
            title="确定要删除这个固件吗？"
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

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">固件管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadModalVisible(true)}>
          上传固件
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Search
              placeholder="搜索固件名称/版本"
              allowClear
              enterButton={<SearchOutlined />}
              onSearch={(value) => setSearchText(value)}
              onChange={(e) => !e.target.value && setSearchText('')}
            />
          </Col>
          <Col xs={24} sm={8} md={5}>
            <Select
              placeholder="按型号筛选"
              allowClear
              style={{ width: '100%' }}
              value={filterModel}
              onChange={(value) => setFilterModel(value)}
            >
              {models.map(model => (
                <Option key={model} value={model}>{model}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={8} md={13} style={{ textAlign: 'right' }}>
            <Button icon={<ReloadOutlined />} onClick={loadFirmwares} loading={loading}>
              刷新
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        columns={columns}
        dataSource={firmwares}
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
        title="上传固件"
        open={uploadModalVisible}
        onCancel={() => {
          setUploadModalVisible(false);
          setSelectedFile(null);
          form.resetFields();
        }}
        footer={null}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleUpload}>
          <Form.Item
            name="name"
            label="固件名称"
            rules={[{ required: true, message: '请输入固件名称' }]}
          >
            <Input placeholder="例如: SC2024标准版固件" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="version"
                label="固件版本"
                rules={[{ required: true, message: '请输入固件版本' }]}
              >
                <Input placeholder="例如: v1.2.3" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="model"
                label="适用型号"
                rules={[{ required: true, message: '请输入适用型号' }]}
              >
                <Input placeholder="例如: SC-2024" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="description"
            label="固件描述"
          >
            <TextArea rows={3} placeholder="描述固件更新内容、修复问题等（可选）" />
          </Form.Item>
          <Form.Item
            name="encrypted"
            label="加密存储"
            valuePropName="checked"
            initialValue={false}
          >
            <Switch 
              checkedChildren={<LockOutlined />} 
              unCheckedChildren={<UnlockOutlined />} 
            />
          </Form.Item>
          <Form.Item
            label="固件文件"
            required
            name="firmware"
          >
            <Upload
              beforeUpload={(file) => {
                setSelectedFile(file);
                return false;
              }}
              onRemove={() => setSelectedFile(null)}
              maxCount={1}
              accept=".bin,.img,.hex,.zip"
            >
              <Button icon={<UploadOutlined />}>选择固件文件</Button>
            </Upload>
            {selectedFile && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
                已选择: {selectedFile.name} ({formatSize(selectedFile.size)})
              </div>
            )}
          </Form.Item>
          {uploading && (
            <div style={{ marginBottom: 16 }}>
              <Progress 
                percent={uploadProgress} 
                status="active"
                strokeColor={{ from: '#108ee9', to: '#87d068' }}
              />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                正在{currentStep}... ({uploadedSize}/{totalSize})
              </div>
            </div>
          )}
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setUploadModalVisible(false);
                setSelectedFile(null);
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={uploading}>
                {uploading ? '上传中...' : '上传'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="固件详情"
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setSelectedFirmware(null);
          setValidationResult(null);
        }}
        width={700}
        footer={[
          <Button
            key="validate"
            icon={<SafetyCertificateOutlined />}
            onClick={() => selectedFirmware && handleValidate(selectedFirmware)}
            loading={validating}
          >
            校验完整性
          </Button>,
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>
        ]}
      >
        {selectedFirmware && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="固件名称">{selectedFirmware.name}</Descriptions.Item>
              <Descriptions.Item label="版本号">
                <Tag color="blue">{selectedFirmware.version}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="适用型号">{selectedFirmware.model}</Descriptions.Item>
              <Descriptions.Item label="文件大小">{formatSize(selectedFirmware.size)}</Descriptions.Item>
              <Descriptions.Item label="上传者">{selectedFirmware.uploadedBy}</Descriptions.Item>
              <Descriptions.Item label="上传时间">
                {dayjs(selectedFirmware.uploadTime).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="MD5" span={2}>
                <span className="hash-display">{selectedFirmware.md5}</span>
              </Descriptions.Item>
              <Descriptions.Item label="SHA256" span={2}>
                <span className="hash-display">{selectedFirmware.sha256}</span>
              </Descriptions.Item>
              {selectedFirmware.description && (
                <Descriptions.Item label="描述" span={2}>
                  {selectedFirmware.description}
                </Descriptions.Item>
              )}
            </Descriptions>

            {validationResult && (
              <Alert
                message={validationResult.valid ? '固件完整性校验通过' : '固件完整性校验失败'}
                description={
                  <div>
                    {validationResult.md5Match !== undefined && (
                      <div style={{ marginBottom: 4 }}>
                        MD5校验: {validationResult.md5Match
                          ? <Tag color="success" icon={<CheckCircleOutlined />}>匹配</Tag>
                          : <Tag color="error" icon={<CloseCircleOutlined />}>不匹配</Tag>}
                      </div>
                    )}
                    {validationResult.sha256Match !== undefined && (
                      <div style={{ marginBottom: 4 }}>
                        SHA256校验: {validationResult.sha256Match
                          ? <Tag color="success" icon={<CheckCircleOutlined />}>匹配</Tag>
                          : <Tag color="error" icon={<CloseCircleOutlined />}>不匹配</Tag>}
                      </div>
                    )}
                    {(validationResult.errors?.length || validationResult.error) && (
                      <div style={{ color: '#ff4d4f' }}>
                        错误: {validationResult.errors?.join(', ') || validationResult.error}
                      </div>
                    )}
                  </div>
                }
                type={validationResult.valid ? 'success' : 'error'}
                showIcon
              />
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default FirmwareList;
