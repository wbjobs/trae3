import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Button, Card, Table, message, Space, Tag, Select, Input, 
  Modal, Form, Input as AntdInput, Row, Col, Statistic, 
  Checkbox, Dropdown, Menu, Tooltip
} from 'antd';
import { 
  CheckOutlined, CloseOutlined, EyeOutlined, 
  ArchiveOutlined, FileSearchOutlined, ReloadOutlined 
} from '@ant-design/icons';
import { reviewAPI, fileAPI } from '../services/api';

const { Search } = Input;
const { TextArea } = AntdInput;
const { Option } = Select;

function ReviewManager() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [stats, setStats] = useState({});
  const [currentStatus, setCurrentStatus] = useState('待审核');
  const [keyword, setKeyword] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [reviewLogs, setReviewLogs] = useState([]);
  const [form] = Form.useForm();
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionType, setActionType] = useState('');
  const [processing, setProcessing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
    fetchData();
  }, [currentStatus, pagination.current, pagination.pageSize]);

  const fetchStats = async () => {
    try {
      const response = await reviewAPI.getStats();
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('获取统计失败');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await reviewAPI.list({
        status: currentStatus,
        page: pagination.current,
        pageSize: pagination.pageSize,
        keyword
      });
      if (response.data.success) {
        setData(response.data.data.list);
        setPagination(prev => ({
          ...prev,
          total: response.data.data.total
        }));
      }
    } catch (error) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchReviewLogs = async (id) => {
    try {
      const response = await reviewAPI.getLogs(id);
      if (response.data.success) {
        setReviewLogs(response.data.data);
      }
    } catch (error) {
      console.error('获取审核日志失败');
    }
  };

  const handleViewDetail = async (record) => {
    setSelectedArchive(record);
    setDetailModalVisible(true);
    fetchReviewLogs(record.id);
  };

  const handleApprove = async (record) => {
    setSelectedArchive(record);
    setActionType('approve');
    form.resetFields();
    setActionModalVisible(true);
  };

  const handleReject = async (record) => {
    setSelectedArchive(record);
    setActionType('reject');
    form.resetFields();
    setActionModalVisible(true);
  };

  const handleActionConfirm = async (values) => {
    if (!selectedArchive) return;

    setProcessing(true);
    try {
      let response;
      if (actionType === 'approve') {
        response = await reviewAPI.approve(selectedArchive.id, '审核员', values.comment);
      } else if (actionType === 'reject') {
        response = await reviewAPI.reject(selectedArchive.id, '审核员', values.comment);
      } else if (actionType === 'archive') {
        response = await reviewAPI.archive(selectedArchive.id, '系统管理员');
      }

      if (response.data.success) {
        message.success('操作成功');
        setActionModalVisible(false);
        fetchData();
        fetchStats();
      } else {
        message.error(response.data.error || '操作失败');
      }
    } catch (error) {
      message.error('操作失败');
    } finally {
      setProcessing(false);
    }
  };

  const handleBatchApprove = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要审核的档案');
      return;
    }

    Modal.confirm({
      title: '批量审核通过',
      content: `确定要批量审核通过 ${selectedRowKeys.length} 条档案吗？`,
      onOk: async () => {
        try {
          const response = await reviewAPI.batchApprove(selectedRowKeys, '审核员', '批量审核通过');
          if (response.data.success) {
            message.success(response.data.message);
            setSelectedRowKeys([]);
            fetchData();
            fetchStats();
          } else {
            message.error('批量审核失败');
          }
        } catch (error) {
          message.error('批量审核失败');
        }
      }
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      '待审核': 'orange',
      '审核通过': 'green',
      '审核驳回': 'red',
      '已归档': 'blue'
    };
    return colors[status] || 'default';
  };

  const columns = [
    {
      title: '档案编号',
      dataIndex: 'archiveNumber',
      key: 'archiveNumber',
      width: 140
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true
    },
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 100
    },
    {
      title: '保管期限',
      dataIndex: 'retentionPeriod',
      key: 'retentionPeriod',
      width: 100
    },
    {
      title: '创建人',
      dataIndex: 'creator',
      key: 'creator',
      width: 100
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      width: 120
    },
    {
      title: '审核状态',
      dataIndex: 'reviewStatus',
      key: 'reviewStatus',
      width: 100,
      render: (status) => (
        <Tag color={getStatusColor(status)}>{status}</Tag>
      )
    },
    {
      title: '审核人',
      dataIndex: 'reviewer',
      key: 'reviewer',
      width: 100
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          {record.reviewStatus === '待审核' && (
            <>
              <Button
                type="link"
                size="small"
                icon={<CheckOutlined />}
                style={{ color: '#52c41a' }}
                onClick={() => handleApprove(record)}
              >
                通过
              </Button>
              <Button
                type="link"
                size="small"
                danger
                icon={<CloseOutlined />}
                onClick={() => handleReject(record)}
              >
                驳回
              </Button>
            </>
          )}
          {record.reviewStatus === '审核通过' && (
            <Button
              type="link"
              size="small"
              icon={<ArchiveOutlined />}
              onClick={() => {
                setSelectedArchive(record);
                setActionType('archive');
                setActionModalVisible(true);
              }}
            >
              归档
            </Button>
          )}
        </Space>
      )
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    getCheckboxProps: (record) => ({
      disabled: record.reviewStatus !== '待审核'
    })
  };

  const statusOptions = [
    { key: '待审核', label: '待审核', count: stats['待审核'] || 0, color: 'orange' },
    { key: '审核通过', label: '审核通过', count: stats['审核通过'] || 0, color: 'green' },
    { key: '审核驳回', label: '审核驳回', count: stats['审核驳回'] || 0, color: 'red' },
    { key: '已归档', label: '已归档', count: stats['已归档'] || 0, color: 'blue' }
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>编目审核</h2>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {statusOptions.map(option => (
          <Col span={6} key={option.key}>
            <Card 
              hoverable
              onClick={() => setCurrentStatus(option.key)}
              style={{ 
                cursor: 'pointer',
                borderColor: currentStatus === option.key ? '#1890ff' : undefined
              }}
            >
              <Statistic
                title={option.label}
                value={option.count}
                valueStyle={{ color: `var(--ant-${option.color})` }}
                prefix={<FileSearchOutlined />}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Select
            value={currentStatus}
            onChange={setCurrentStatus}
            style={{ width: 150 }}
          >
            <Option value="all">全部</Option>
            <Option value="待审核">待审核</Option>
            <Option value="审核通过">审核通过</Option>
            <Option value="审核驳回">审核驳回</Option>
            <Option value="已归档">已归档</Option>
          </Select>
          <Search
            placeholder="搜索标题/编号"
            style={{ width: 250 }}
            onSearch={(value) => {
              setKeyword(value);
              fetchData();
            }}
            allowClear
          />
          <Button
            type="primary"
            icon={<CheckOutlined />}
            disabled={selectedRowKeys.length === 0}
            onClick={handleBatchApprove}
          >
            批量通过 ({selectedRowKeys.length})
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchData}
          >
            刷新
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          rowSelection={rowSelection}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            onChange: (page, pageSize) => {
              setPagination({ ...pagination, current: page, pageSize });
            }
          }}
        />
      </Card>

      <Modal
        title="档案详情"
        open={detailModalVisible}
        width={900}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>
        ]}
      >
        {selectedArchive && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <div><strong>档案编号：</strong>{selectedArchive.archiveNumber}</div>
                </Col>
                <Col span={12}>
                  <div><strong>审核状态：</strong>
                    <Tag color={getStatusColor(selectedArchive.reviewStatus)}>
                      {selectedArchive.reviewStatus}
                    </Tag>
                  </div>
                </Col>
                <Col span={24} style={{ marginTop: 8 }}>
                  <div><strong>标题：</strong>{selectedArchive.title}</div>
                </Col>
                <Col span={8} style={{ marginTop: 8 }}>
                  <div><strong>类别：</strong>{selectedArchive.category}</div>
                </Col>
                <Col span={8} style={{ marginTop: 8 }}>
                  <div><strong>保管期限：</strong>{selectedArchive.retentionPeriod}</div>
                </Col>
                <Col span={8} style={{ marginTop: 8 }}>
                  <div><strong>创建人：</strong>{selectedArchive.creator}</div>
                </Col>
                <Col span={12} style={{ marginTop: 8 }}>
                  <div><strong>部门：</strong>{selectedArchive.department}</div>
                </Col>
                <Col span={12} style={{ marginTop: 8 }}>
                  <div><strong>创建日期：</strong>{selectedArchive.creationDate}</div>
                </Col>
                {selectedArchive.reviewComment && (
                  <Col span={24} style={{ marginTop: 8 }}>
                    <div><strong>审核意见：</strong>{selectedArchive.reviewComment}</div>
                  </Col>
                )}
              </Row>
            </div>

            <div style={{ borderTop: '1px solid #eee', paddingTop: 16 }}>
              <h4 style={{ marginBottom: 12 }}>审核日志</h4>
              {reviewLogs.length > 0 ? (
                reviewLogs.map((log, index) => (
                  <div key={index} style={{ 
                    padding: '8px 12px', 
                    background: '#f5f5f5', 
                    borderRadius: 4,
                    marginBottom: 8 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        <Tag color={
                          log.action === 'approve' ? 'green' :
                          log.action === 'reject' ? 'red' : 'blue'
                        }>
                          {log.action === 'approve' ? '审核通过' :
                           log.action === 'reject' ? '审核驳回' :
                           log.action === 'archive' ? '归档' : '提交'}
                        </Tag>
                        <span style={{ marginLeft: 8 }}>{log.reviewer}</span>
                      </span>
                      <span style={{ color: '#999', fontSize: 12 }}>{log.created_at}</span>
                    </div>
                    {log.comment && (
                      <div style={{ marginTop: 4, fontSize: 13 }}>{log.comment}</div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ color: '#999' }}>暂无审核记录</div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={
          actionType === 'approve' ? '审核通过' :
          actionType === 'reject' ? '审核驳回' : '归档确认'
        }
        open={actionModalVisible}
        onCancel={() => setActionModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setActionModalVisible(false)}>
            取消
          </Button>,
          <Button 
            key="confirm" 
            type={actionType === 'reject' ? 'danger' : 'primary'}
            onClick={form.submit}
            loading={processing}
          >
            {actionType === 'approve' ? '通过' : 
             actionType === 'reject' ? '驳回' : '确认归档'}
          </Button>
        ]}
      >
        <Form form={form} layout="vertical" onFinish={handleActionConfirm}>
          {actionType === 'reject' && (
            <Form.Item
              name="comment"
              label="驳回原因"
              rules={[{ required: true, message: '请填写驳回原因' }]}
            >
              <TextArea rows={4} placeholder="请填写驳回原因" />
            </Form.Item>
          )}
          {actionType === 'approve' && (
            <Form.Item name="comment" label="审核意见（可选）">
              <TextArea rows={3} placeholder="请填写审核意见" />
            </Form.Item>
          )}
          {actionType === 'archive' && (
            <div>
              <p>确定要将该档案归档吗？</p>
              <p style={{ color: '#666', fontSize: 13 }}>归档后档案将进入正式库存，不可随意修改。</p>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  );
}

export default ReviewManager;
