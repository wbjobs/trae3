import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Input,
  Select,
  Button,
  Tag,
  Modal,
  Tabs,
  List,
  Empty,
  Space,
  Tooltip,
  Divider,
  Statistic,
  Row,
  Col
} from 'antd';
import {
  Search,
  Download,
  Eye,
  FileText,
  Filter,
  Grid3X3,
  List as ListIcon,
  Clock,
  User,
  HardDrive,
  CheckCircle,
  XCircle,
  History
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { statusLabels, statusColors, fileTypeLabels, coordinateSystems, scales } from '../data/mockData';
import type { ArchiveMetadata } from '../../shared/types';

const { Search: SearchInput } = Input;
const { Option } = Select;
const { TabPane } = Tabs;

const ArchivePage = () => {
  const navigate = useNavigate();
  const { archives, qualityRecords } = useAppStore();
  const [searchText, setSearchText] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [advancedFilterVisible, setAdvancedFilterVisible] = useState(false);
  const [coordinateSystemFilter, setCoordinateSystemFilter] = useState<string[]>([]);
  const [scaleFilter, setScaleFilter] = useState<string[]>([]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const filteredArchives = archives.filter((archive) => {
    const matchSearch = archive.projectName.toLowerCase().includes(searchText.toLowerCase()) ||
                        archive.surveyArea.toLowerCase().includes(searchText.toLowerCase());
    const matchFileType = fileTypeFilter.length === 0 || fileTypeFilter.includes(archive.fileType);
    const matchStatus = statusFilter.length === 0 || statusFilter.includes(archive.status);
    const matchCoordinate = coordinateSystemFilter.length === 0 || coordinateSystemFilter.includes(archive.coordinateSystem);
    const matchScale = scaleFilter.length === 0 || scaleFilter.includes(archive.scale);
    
    return matchSearch && matchFileType && matchStatus && matchCoordinate && matchScale;
  });

  const approvedCount = archives.filter(a => a.status === 'APPROVED').length;
  const totalSize = archives.reduce((sum, a) => sum + a.fileSize, 0);

  const handleViewDetail = (archive: ArchiveMetadata) => {
    navigate(`/archive/${archive.id}`);
  };

  const handleDownload = (archive: ArchiveMetadata) => {
    Modal.success({
      title: '下载任务已创建',
      content: `正在准备下载：${archive.fileName}`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 m-0">档案检索</h2>
          <p className="text-gray-500 mt-1 m-0">快速检索和下载测绘成果档案</p>
        </div>
      </div>

      <Row gutter={16}>
        <Col span={6}>
          <Card className="shadow-sm">
            <Statistic
              title="档案总数"
              value={archives.length}
              prefix={<FileText size={20} className="text-blue-500" />}
              valueStyle={{ color: '#165DFF' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="shadow-sm">
            <Statistic
              title="已归档"
              value={approvedCount}
              prefix={<CheckCircle size={20} className="text-green-500" />}
              valueStyle={{ color: '#0FC6C2' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="shadow-sm">
            <Statistic
              title="存储总量"
              value={formatFileSize(totalSize)}
              prefix={<HardDrive size={20} className="text-purple-500" />}
              valueStyle={{ color: '#722ED1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="shadow-sm">
            <Statistic
              title="待质检"
              value={archives.filter(a => a.status === 'PENDING').length}
              prefix={<Clock size={20} className="text-orange-500" />}
              valueStyle={{ color: '#FF7D00' }}
            />
          </Card>
        </Col>
      </Row>

      <Card className="shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex-1 max-w-2xl">
            <SearchInput
              placeholder="搜索项目名称、测区范围..."
              allowClear
              size="large"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={(value) => setSearchText(value)}
              prefix={<Search size={18} className="text-gray-400" />}
            />
          </div>
          <Space>
            <Button
              icon={<Filter size={16} />}
              onClick={() => setAdvancedFilterVisible(!advancedFilterVisible)}
              type={advancedFilterVisible ? 'primary' : 'default'}
            >
              高级筛选
            </Button>
            <div className="flex items-center border rounded-lg p-0.5">
              <Button
                type="text"
                size="small"
                icon={<Grid3X3 size={16} />}
                onClick={() => setViewMode('grid')}
                className={viewMode === 'grid' ? 'bg-gray-100' : ''}
              />
              <Button
                type="text"
                size="small"
                icon={<ListIcon size={16} />}
                onClick={() => setViewMode('list')}
                className={viewMode === 'list' ? 'bg-gray-100' : ''}
              />
            </div>
          </Space>
        </div>

        {advancedFilterVisible && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">文件类型</label>
                <Select
                  mode="multiple"
                  placeholder="选择文件类型"
                  value={fileTypeFilter}
                  onChange={setFileTypeFilter}
                  style={{ width: '100%' }}
                >
                  {Object.entries(fileTypeLabels).map(([key, label]) => (
                    <Option key={key} value={key}>{label}</Option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">状态</label>
                <Select
                  mode="multiple"
                  placeholder="选择状态"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  style={{ width: '100%' }}
                >
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <Option key={key} value={key}>{label}</Option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">坐标系</label>
                <Select
                  mode="multiple"
                  placeholder="选择坐标系"
                  value={coordinateSystemFilter}
                  onChange={setCoordinateSystemFilter}
                  style={{ width: '100%' }}
                >
                  {coordinateSystems.map((sys) => (
                    <Option key={sys} value={sys}>{sys}</Option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">比例尺</label>
                <Select
                  mode="multiple"
                  placeholder="选择比例尺"
                  value={scaleFilter}
                  onChange={setScaleFilter}
                  style={{ width: '100%' }}
                >
                  {scales.map((scale) => (
                    <Option key={scale} value={scale}>{scale}</Option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-500">
            共找到 <strong className="text-gray-800">{filteredArchives.length}</strong> 条记录
          </span>
          {(fileTypeFilter.length > 0 || statusFilter.length > 0 || coordinateSystemFilter.length > 0 || scaleFilter.length > 0 || searchText) && (
            <Button
              type="link"
              size="small"
              onClick={() => {
                setSearchText('');
                setFileTypeFilter([]);
                setStatusFilter([]);
                setCoordinateSystemFilter([]);
                setScaleFilter([]);
              }}
            >
              清除筛选
            </Button>
          )}
        </div>

        {filteredArchives.length === 0 ? (
          <Empty description="没有找到匹配的档案" />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredArchives.map((archive) => (
              <Card
                key={archive.id}
                hoverable
                className="group transition-all duration-300 hover:shadow-lg"
                onClick={() => handleViewDetail(archive)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center">
                    <span className="text-blue-600 font-bold text-xs">
                      {archive.fileType}
                    </span>
                  </div>
                  <Tag color={statusColors[archive.status]}>
                    {statusLabels[archive.status]}
                  </Tag>
                </div>
                <h3 className="font-semibold text-gray-800 mb-2 line-clamp-2 h-12">
                  {archive.projectName}
                </h3>
                <div className="space-y-1 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <HardDrive size={14} />
                    <span>{formatFileSize(archive.fileSize)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User size={14} />
                    <span>{archive.uploader}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} />
                    <span>{archive.uploadTime}</span>
                  </div>
                </div>
                <Divider className="my-3" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {archive.coordinateSystem} · {archive.scale}
                  </span>
                  <Space>
                    <Tooltip title="查看详情">
                      <Button
                        type="text"
                        size="small"
                        icon={<Eye size={16} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetail(archive);
                        }}
                      />
                    </Tooltip>
                    {archive.status === 'APPROVED' && (
                      <Tooltip title="下载">
                        <Button
                          type="text"
                          size="small"
                          icon={<Download size={16} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(archive);
                          }}
                        />
                      </Tooltip>
                    )}
                  </Space>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <List
            dataSource={filteredArchives}
            renderItem={(archive) => (
              <List.Item className="px-4 py-4 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-xs">
                        {archive.fileType}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-800 m-0">{archive.projectName}</h4>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span>{fileTypeLabels[archive.fileType]}</span>
                        <span>{formatFileSize(archive.fileSize)}</span>
                        <span>{archive.uploader}</span>
                        <span>{archive.uploadTime}</span>
                      </div>
                    </div>
                  </div>
                  <Space>
                    <Tag color={statusColors[archive.status]}>
                      {statusLabels[archive.status]}
                    </Tag>
                    <Tooltip title="查看详情">
                      <Button
                        type="text"
                        size="small"
                        icon={<Eye size={16} />}
                        onClick={() => handleViewDetail(archive)}
                      />
                    </Tooltip>
                    {archive.status === 'APPROVED' && (
                      <Tooltip title="下载">
                        <Button
                          type="primary"
                          size="small"
                          icon={<Download size={16} />}
                          onClick={() => handleDownload(archive)}
                        >
                          下载
                        </Button>
                      </Tooltip>
                    )}
                  </Space>
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default ArchivePage;
