import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Descriptions, Button, Card, message, Space, Tag, Divider, Select } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, EditOutlined } from '@ant-design/icons';
import { archiveAPI, fileAPI } from '../services/api';

const categories = [
  '文书档案', '科技档案', '会计档案', '人事档案', '声像档案', '电子档案'
];

function ArchivePreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [archive, setArchive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedArchive, setSelectedArchive] = useState(id || '');
  const [archiveList, setArchiveList] = useState([]);

  useEffect(() => {
    fetchArchiveList();
  }, []);

  useEffect(() => {
    if (id) {
      fetchArchive(id);
    }
  }, [id]);

  const fetchArchiveList = async () => {
    try {
      const response = await archiveAPI.list({ pageSize: 100 });
      if (response.data.success) {
        setArchiveList(response.data.data.list);
      }
    } catch (error) {
      console.error('获取列表失败');
    }
  };

  const fetchArchive = async (archiveId) => {
    setLoading(true);
    try {
      const response = await archiveAPI.get(archiveId);
      if (response.data.success) {
        setArchive(response.data.data);
      }
    } catch (error) {
      message.error('获取档案信息失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChange = (value) => {
    setSelectedArchive(value);
    navigate(`/preview/${value}`);
  };

  const getCategoryColor = (category) => {
    const colors = {
      '文书档案': 'blue',
      '科技档案': 'green',
      '会计档案': 'purple',
      '人事档案': 'orange',
      '声像档案': 'cyan',
      '电子档案': 'magenta'
    };
    return colors[category] || 'default';
  };

  const getRetentionColor = (period) => {
    if (period === '永久') return 'red';
    if (period === '30年') return 'orange';
    if (period === '10年') return 'gold';
    return 'green';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div>
      <Space style={{ marginBottom: 24 }} align="center">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/search')}
        >
          返回检索
        </Button>
        <h2 style={{ margin: 0 }}>档案预览</h2>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <span>选择档案：</span>
          <Select
            style={{ width: 300 }}
            placeholder="请选择要预览的档案"
            value={selectedArchive || undefined}
            onChange={handleSelectChange}
            showSearch
            optionFilterProp="children"
          >
            {archiveList.map(item => (
              <Select.Option key={item.id} value={item.id}>
                {item.archiveNumber} - {item.title}
              </Select.Option>
            ))}
          </Select>
        </Space>
      </Card>

      {archive && (
        <>
          <Card title="基本信息" style={{ marginBottom: 16 }} loading={loading}>
            <Descriptions column={2} bordered>
              <Descriptions.Item label="档案编号" span={1}>
                <Tag color="blue">{archive.archiveNumber}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="档案类别" span={1}>
                <Tag color={getCategoryColor(archive.category)}>{archive.category}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="档案标题" span={2}>
                {archive.title}
              </Descriptions.Item>
              <Descriptions.Item label="保管期限" span={1}>
                <Tag color={getRetentionColor(archive.retentionPeriod)}>{archive.retentionPeriod}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态" span={1}>
                <Tag color="green">{archive.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建人" span={1}>
                {archive.creator}
              </Descriptions.Item>
              <Descriptions.Item label="所属部门" span={1}>
                {archive.department}
              </Descriptions.Item>
              <Descriptions.Item label="创建日期" span={1}>
                {archive.creationDate}
              </Descriptions.Item>
              <Descriptions.Item label="录入时间" span={1}>
                {archive.createdAt}
              </Descriptions.Item>
              <Descriptions.Item label="关键词" span={2}>
                {archive.keywords?.map((kw, idx) => (
                  <Tag key={idx}>{kw}</Tag>
                ))}
              </Descriptions.Item>
              <Descriptions.Item label="档案描述" span={2}>
                {archive.description || '暂无描述'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {archive.filePath && (
            <Card
              title="附件信息"
              extra={
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={() => fileAPI.download(archive.id)}
                >
                  下载附件
                </Button>
              }
              style={{ marginBottom: 16 }}
            >
              <Descriptions column={2}>
                <Descriptions.Item label="文件名">{archive.fileOriginalName}</Descriptions.Item>
                <Descriptions.Item label="文件大小">{formatFileSize(archive.fileSize)}</Descriptions.Item>
                <Descriptions.Item label="文件类型">{archive.fileType}</Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          {archive.filePath && (
            <Card title="文件预览">
              {archive.fileType?.startsWith('image/') ? (
                <div style={{ textAlign: 'center' }}>
                  <img
                    src={fileAPI.preview(archive.id)}
                    alt={archive.fileOriginalName}
                    style={{ maxWidth: '100%', maxHeight: 600 }}
                  />
                </div>
              ) : archive.fileType === 'application/pdf' ? (
                <iframe
                  src={fileAPI.preview(archive.id)}
                  style={{ width: '100%', height: 600, border: 'none' }}
                  title="PDF预览"
                />
              ) : archive.fileType?.startsWith('text/') ? (
                <iframe
                  src={fileAPI.preview(archive.id)}
                  style={{ width: '100%', height: 400, border: '1px solid #ddd' }}
                  title="文本预览"
                />
              ) : (
                <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
                  <p>该文件类型不支持在线预览</p>
                  <p style={{ marginTop: 8 }}>请下载后查看</p>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {!archive && !loading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
            请选择要预览的档案
          </div>
        </Card>
      )}
    </div>
  );
}

export default ArchivePreview;
