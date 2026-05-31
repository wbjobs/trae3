import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Tag,
  Tabs,
  List,
  Space,
  Divider,
  Modal
} from 'antd';
import {
  ArrowLeft,
  Download,
  FileText,
  CheckCircle,
  XCircle,
  History,
  Clock,
  User,
  HardDrive,
  Image,
  Map,
  Box,
  File,
  AlertCircle
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { statusLabels, statusColors, fileTypeLabels } from '../data/mockData';

const { TabPane } = Tabs;

const ArchiveDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { archives, qualityRecords } = useAppStore();

  const archive = archives.find(a => a.id === id);
  const records = qualityRecords.filter(r => r.archiveId === id);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getFilePreviewIcon = (fileType: string) => {
    switch (fileType) {
      case 'DWG': return <Map size={48} className="text-blue-500" />;
      case 'SHP': return <Map size={48} className="text-green-500" />;
      case 'TIF': return <Image size={48} className="text-orange-500" />;
      case 'GDB': return <Box size={48} className="text-purple-500" />;
      default: return <File size={48} className="text-gray-500" />;
    }
  };

  const getPreviewHint = (fileType: string) => {
    switch (fileType) {
      case 'DWG': return 'AutoCAD 矢量图纸，需使用专业 CAD 软件查看完整内容';
      case 'SHP': return 'Shapefile 矢量数据，包含空间要素与属性信息';
      case 'TIF': return '遥感影像栅格数据，可能包含多波段信息';
      case 'GDB': return '地理数据库，包含要素数据集与拓扑关系';
      default: return '压缩归档文件，包含多个测绘成果文件';
    }
  };

  const handleDownload = () => {
    if (!archive) return;
    if (archive.filePath) {
      const link = document.createElement('a');
      link.href = `/api/archive/${archive.id}/download`;
      link.download = archive.fileName;
      link.click();
    } else {
      Modal.info({
        title: '文件下载',
        content: `正在准备下载：${archive.fileName}，文件大小 ${formatFileSize(archive.fileSize)}`,
      });
    }
  };

  if (!archive) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle size={64} className="text-gray-300 mb-4" />
        <p className="text-lg text-gray-500 mb-4">未找到该档案</p>
        <Button type="primary" onClick={() => navigate('/archive')}>
          返回检索
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            icon={<ArrowLeft size={16} />}
            onClick={() => navigate('/archive')}
          >
            返回检索
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-gray-800 m-0">{archive.projectName}</h2>
            <p className="text-gray-500 mt-1 m-0">
              档案编号：{archive.id} · 版本 v{archive.version}
            </p>
          </div>
        </div>
        <Space>
          <Tag color={statusColors[archive.status]} className="text-base px-4 py-1">
            {statusLabels[archive.status]}
          </Tag>
          {archive.status === 'APPROVED' && (
            <Button
              type="primary"
              icon={<Download size={16} />}
              onClick={handleDownload}
            >
              下载文件
            </Button>
          )}
        </Space>
      </div>

      <Card className="shadow-sm">
        <Tabs defaultActiveKey="info">
          <TabPane tab="基本信息" key="info">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm text-gray-500">项目名称</label>
                    <p className="font-medium text-gray-800 text-lg m-0">{archive.projectName}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">文件名称</label>
                    <p className="font-medium text-gray-800 m-0">{archive.fileName}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">文件类型</label>
                    <p className="m-0">
                      <Tag color="blue">{fileTypeLabels[archive.fileType]}</Tag>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">文件大小</label>
                    <p className="font-medium text-gray-800 m-0">{formatFileSize(archive.fileSize)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">坐标系</label>
                    <p className="font-medium text-gray-800 m-0">{archive.coordinateSystem}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">比例尺</label>
                    <p className="font-medium text-gray-800 m-0">{archive.scale}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">测区范围</label>
                    <p className="font-medium text-gray-800 m-0">{archive.surveyArea}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">版本号</label>
                    <p className="font-medium text-gray-800 m-0">v{archive.version}</p>
                  </div>
                </div>
                <Divider />
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm text-gray-500">上传人</label>
                    <p className="font-medium text-gray-800 m-0">{archive.uploader}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">上传时间</label>
                    <p className="font-medium text-gray-800 m-0">{archive.uploadTime}</p>
                  </div>
                </div>
                <Divider />
                <div>
                  <label className="text-sm text-gray-500">当前状态</label>
                  <p className="m-0 mt-1">
                    <Tag color={statusColors[archive.status]}>
                      {statusLabels[archive.status]}
                    </Tag>
                    {archive.qualityScore !== undefined && (
                      <span className="ml-2 text-gray-600">
                        质检评分：<strong>{archive.qualityScore}</strong> 分
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="lg:col-span-1">
                <Card
                  className="bg-gray-50"
                  title={
                    <span className="flex items-center gap-2">
                      <FileText size={16} />
                      附件预览
                    </span>
                  }
                >
                  <div className="flex flex-col items-center py-6">
                    <div className="w-24 h-24 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4">
                      {getFilePreviewIcon(archive.fileType)}
                    </div>
                    <p className="font-semibold text-gray-800 mb-1">{archive.fileName}</p>
                    <p className="text-sm text-gray-500 mb-3">{formatFileSize(archive.fileSize)}</p>
                    <Tag color="blue">{fileTypeLabels[archive.fileType]}</Tag>
                    <p className="text-xs text-gray-400 mt-4 text-center px-4">
                      {getPreviewHint(archive.fileType)}
                    </p>
                    {archive.filePath && (
                      <div className="mt-4 w-full bg-white rounded-lg p-3 text-xs text-gray-500">
                        <div className="flex items-center gap-2 mb-1">
                          <HardDrive size={12} />
                          <span>存储路径</span>
                        </div>
                        <code className="text-blue-600 break-all">{archive.filePath}</code>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </TabPane>

          <TabPane tab="附件信息" key="attachment">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title="文件属性" className="shadow-sm">
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">文件名</span>
                    <span className="font-medium text-gray-800">{archive.fileName}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">文件类型</span>
                    <Tag color="blue">{fileTypeLabels[archive.fileType]}</Tag>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">文件大小</span>
                    <span className="font-medium text-gray-800">{formatFileSize(archive.fileSize)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">存储路径</span>
                    <code className="text-sm text-blue-600">{archive.filePath || '本地存储'}</code>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">上传时间</span>
                    <span className="text-gray-800">{archive.uploadTime}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-gray-500">版本</span>
                    <span className="text-gray-800">v{archive.version}</span>
                  </div>
                </div>
              </Card>

              <Card title="文件预览" className="shadow-sm">
                <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-lg">
                  {getFilePreviewIcon(archive.fileType)}
                  <p className="text-gray-600 mt-4 font-medium">{archive.fileName}</p>
                  <p className="text-sm text-gray-400 mt-2">{getPreviewHint(archive.fileType)}</p>
                  {archive.status === 'APPROVED' && (
                    <Button
                      type="primary"
                      className="mt-4"
                      icon={<Download size={16} />}
                      onClick={handleDownload}
                    >
                      下载附件
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          </TabPane>

          <TabPane tab="质检历史" key="history">
            <List
              dataSource={records}
              locale={{ emptyText: '暂无质检记录' }}
              renderItem={(record) => (
                <List.Item className="px-0">
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
                          {record.result === 'PASS' ? '质检通过' : '质检驳回'}
                        </p>
                        <p className="text-sm text-gray-500 m-0">
                          <History size={14} className="inline mr-1" />
                          {record.checkTime} · 质检员：{record.inspector}
                        </p>
                        {record.comments && (
                          <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-2 rounded">
                            {record.comments}
                          </p>
                        )}
                        {record.issues.length > 0 && (
                          <div className="mt-3">
                            {record.issues.map((issue) => (
                              <div key={issue.id} className="flex items-start gap-2 text-sm py-1">
                                <Tag
                                  color={
                                    issue.severity === 'CRITICAL' ? 'red' :
                                    issue.severity === 'MAJOR' ? 'orange' : 'blue'
                                  }
                                >
                                  {issue.severity === 'CRITICAL' ? '严重' :
                                   issue.severity === 'MAJOR' ? '主要' : '轻微'}
                                </Tag>
                                <span className="text-gray-700">{issue.description}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default ArchiveDetailPage;
