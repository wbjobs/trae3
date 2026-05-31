import { useState, useEffect } from 'react';
import { 
  Button, Card, Table, message, Upload, Space, Tag, Modal, 
  Descriptions, Progress, Statistic, Row, Col 
} from 'antd';
import { 
  UploadOutlined, DownloadOutlined, CheckCircleOutlined, 
  CloseCircleOutlined, FileExcelOutlined 
} from '@ant-design/icons';
import { importAPI } from '../services/api';

function BatchImport() {
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [taskInfo, setTaskInfo] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await importAPI.getTasks({ pageSize: 10 });
      if (response.data.success) {
        setTasks(response.data.data.list);
      }
    } catch (error) {
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const response = await importAPI.upload(file, '系统管理员');
      if (response.data.success) {
        message.success('文件解析成功');
        setPreviewData(response.data.data.previewData);
        setTaskInfo({
          taskId: response.data.data.taskId,
          fileName: response.data.data.fileName,
          totalCount: response.data.data.totalCount
        });
        setConfirmModalVisible(true);
      } else {
        message.error(response.data.error || '文件解析失败');
      }
    } catch (error) {
      message.error('文件上传失败');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleConfirmImport = async () => {
    if (!taskInfo) return;

    setImporting(true);
    try {
      const response = await importAPI.confirm(taskInfo.taskId, '系统管理员');
      if (response.data.success) {
        message.success(`导入完成：成功${response.data.data.successCount}条，失败${response.data.data.failCount}条`);
        setConfirmModalVisible(false);
        setPreviewData(null);
        setTaskInfo(null);
        fetchTasks();
      } else {
        message.error(response.data.error || '导入失败');
      }
    } catch (error) {
      message.error('导入失败');
    } finally {
      setImporting(false);
    }
  };

  const previewColumns = [
    {
      title: '行号',
      dataIndex: 'rowNumber',
      key: 'rowNumber',
      width: 80
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
      title: '校验结果',
      dataIndex: 'valid',
      key: 'valid',
      width: 100,
      render: (valid) => (
        valid ? 
          <Tag color="green" icon={<CheckCircleOutlined />}>通过</Tag> : 
          <Tag color="red" icon={<CloseCircleOutlined />}>不通过</Tag>
      )
    },
    {
      title: '错误信息',
      dataIndex: 'errors',
      key: 'errors',
      render: (errors) => (
        <div style={{ color: '#ff4d4f', fontSize: 12 }}>
          {errors?.join('; ')}
        </div>
      )
    }
  ];

  const taskColumns = [
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      ellipsis: true
    },
    {
      title: '总数',
      dataIndex: 'total_count',
      key: 'total_count',
      width: 80
    },
    {
      title: '成功',
      dataIndex: 'success_count',
      key: 'success_count',
      width: 80,
      render: (count) => <Tag color="green">{count}</Tag>
    },
    {
      title: '失败',
      dataIndex: 'fail_count',
      key: 'fail_count',
      width: 80,
      render: (count) => <Tag color="red">{count}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const statusMap = {
          'preview': { color: 'blue', text: '预览中' },
          'processing': { color: 'orange', text: '处理中' },
          'completed': { color: 'green', text: '已完成' },
          'failed': { color: 'red', text: '失败' }
        };
        const config = statusMap[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180
    }
  ];

  const successCount = previewData?.filter(item => item.valid).length || 0;
  const failCount = previewData?.filter(item => !item.valid).length || 0;

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>批量导入</h2>
      
      <Card style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <Upload
              beforeUpload={handleUpload}
              showUploadList={false}
              accept=".xlsx,.xls,.csv"
            >
              <Button 
                type="primary" 
                icon={<UploadOutlined />}
                loading={uploading}
              >
                上传Excel文件
              </Button>
            </Upload>
            <Button 
              icon={<DownloadOutlined />}
              onClick={() => importAPI.downloadTemplate()}
            >
              下载导入模板
            </Button>
          </Space>
          <div style={{ color: '#666', fontSize: 14 }}>
            <FileExcelOutlined style={{ marginRight: 8 }} />
            支持 .xlsx, .xls, .csv 格式，文件大小不超过 50MB
          </div>
        </Space>
      </Card>

      <Card title="导入任务历史" style={{ marginBottom: 24 }}>
        <Table
          columns={taskColumns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="确认导入"
        open={confirmModalVisible}
        width={1000}
        onCancel={() => setConfirmModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setConfirmModalVisible(false)}>
            取消
          </Button>,
          <Button 
            key="confirm" 
            type="primary" 
            onClick={handleConfirmImport}
            loading={importing}
            disabled={failCount > 0}
          >
            确认导入
          </Button>
        ]}
      >
        {taskInfo && (
          <div style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="文件名" value={taskInfo.fileName} />
              </Col>
              <Col span={5}>
                <Statistic title="总计" value={taskInfo.totalCount} suffix="条" />
              </Col>
              <Col span={5}>
                <Statistic 
                  title="校验通过" 
                  value={successCount} 
                  suffix="条"
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="校验失败" 
                  value={failCount} 
                  suffix="条"
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Col>
            </Row>
            {failCount > 0 && (
              <div style={{ marginTop: 16, color: '#ff4d4f' }}>
                <CloseCircleOutlined style={{ marginRight: 8 }} />
                存在校验失败的数据，请修正后重新上传
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 8 }}>
          <strong>数据预览（前10条）：</strong>
        </div>
        <Table
          columns={previewColumns}
          dataSource={previewData}
          rowKey="rowNumber"
          pagination={false}
          size="small"
          scroll={{ x: 1200 }}
        />
      </Modal>
    </div>
  );
}

export default BatchImport;
