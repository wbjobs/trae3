import type { ArchiveMetadata, QualityRecord, UploadTask, User } from '../../shared/types';

export const mockUser: User = {
  id: 'user-001',
  name: '张三',
  role: 'admin',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin'
};

export const mockArchives: ArchiveMetadata[] = [
  {
    id: 'archive-001',
    projectName: '北京市朝阳区地形测绘项目',
    coordinateSystem: 'CGCS2000',
    scale: '1:500',
    surveyArea: '北京市朝阳区',
    fileType: 'DWG',
    fileSize: 1024 * 1024 * 50,
    fileName: 'chaoyang_topographic.dwg',
    filePath: '/storage/archives/chaoyang_topographic_1705306200000.dwg',
    uploader: '李上传',
    uploadTime: '2024-01-15 10:30:00',
    status: 'APPROVED',
    qualityScore: 95,
    version: 1
  },
  {
    id: 'archive-002',
    projectName: '上海市浦东新区地籍调查',
    coordinateSystem: 'CGCS2000',
    scale: '1:1000',
    surveyArea: '上海市浦东新区',
    fileType: 'SHP',
    fileSize: 1024 * 1024 * 120,
    fileName: 'pudong_cadastral.shp',
    filePath: '/storage/archives/pudong_cadastral_1705395600000.shp',
    uploader: '王数据',
    uploadTime: '2024-01-16 14:20:00',
    status: 'PENDING',
    version: 1
  },
  {
    id: 'archive-003',
    projectName: '深圳市南山区三维建模',
    coordinateSystem: 'WGS84',
    scale: '1:2000',
    surveyArea: '深圳市南山区',
    fileType: 'GDB',
    fileSize: 1024 * 1024 * 500,
    fileName: 'nanshan_3d_model.gdb',
    filePath: '/storage/archives/nanshan_3d_model_1705456500000.gdb',
    uploader: '陈测绘',
    uploadTime: '2024-01-17 09:15:00',
    status: 'QUALITY_CHECKING',
    version: 2
  },
  {
    id: 'archive-004',
    projectName: '广州市天河区遥感影像',
    coordinateSystem: 'WGS84',
    scale: '1:5000',
    surveyArea: '广州市天河区',
    fileType: 'TIF',
    fileSize: 1024 * 1024 * 800,
    fileName: 'tianhe_remote_sensing.tif',
    filePath: '/storage/archives/tianhe_remote_sensing_1705563900000.tif',
    uploader: '刘遥感',
    uploadTime: '2024-01-18 16:45:00',
    status: 'REJECTED',
    qualityScore: 65,
    version: 1
  },
  {
    id: 'archive-005',
    projectName: '成都市高新区管线测量',
    coordinateSystem: 'CGCS2000',
    scale: '1:500',
    surveyArea: '成都市高新区',
    fileType: 'DWG',
    fileSize: 1024 * 1024 * 85,
    fileName: 'gaoxin_pipeline.dwg',
    filePath: '/storage/archives/gaoxin_pipeline_1705635600000.dwg',
    uploader: '赵管线',
    uploadTime: '2024-01-19 11:00:00',
    status: 'VALIDATING',
    version: 1
  },
  {
    id: 'archive-006',
    projectName: '杭州市西湖区房产测绘',
    coordinateSystem: 'CGCS2000',
    scale: '1:500',
    surveyArea: '杭州市西湖区',
    fileType: 'OTHER',
    fileSize: 1024 * 1024 * 35,
    fileName: 'xihu_property.zip',
    filePath: '/storage/archives/xihu_property_1705720200000.zip',
    uploader: '孙房产',
    uploadTime: '2024-01-20 13:30:00',
    status: 'APPROVED',
    qualityScore: 92,
    version: 1
  }
];

export const mockQualityRecords: QualityRecord[] = [
  {
    id: 'record-001',
    archiveId: 'archive-001',
    inspector: '质检王',
    checkTime: '2024-01-16 15:00:00',
    result: 'PASS',
    comments: '数据完整，格式规范，符合质检要求。',
    issues: []
  },
  {
    id: 'record-002',
    archiveId: 'archive-004',
    inspector: '质检李',
    checkTime: '2024-01-19 10:30:00',
    result: 'FAIL',
    comments: '存在多个严重问题，需重新提交。',
    issues: [
      {
        id: 'issue-001',
        type: 'FORMAT',
        severity: 'CRITICAL',
        description: '文件头格式不符合标准规范',
        location: '文件头部 0x00-0x20'
      },
      {
        id: 'issue-002',
        type: 'CONTENT',
        severity: 'MAJOR',
        description: '坐标值超出测区范围',
        location: '第5个要素'
      },
      {
        id: 'issue-003',
        type: 'METADATA',
        severity: 'MINOR',
        description: '元数据缺失坐标系说明'
      }
    ]
  },
  {
    id: 'record-003',
    archiveId: 'archive-006',
    inspector: '质检张',
    checkTime: '2024-01-21 09:00:00',
    result: 'PASS',
    comments: '数据质量良好，建议归档。',
    issues: [
      {
        id: 'issue-004',
        type: 'METADATA',
        severity: 'MINOR',
        description: '建议补充测区边界坐标'
      }
    ]
  }
];

export const mockUploadTasks: UploadTask[] = [
  {
    id: 'task-001',
    fileName: '海淀区路网数据.shp',
    fileSize: 1024 * 1024 * 45,
    progress: 75,
    status: 'UPLOADING'
  },
  {
    id: 'task-002',
    fileName: '亦庄开发区地形.dwg',
    fileSize: 1024 * 1024 * 120,
    progress: 100,
    status: 'VALIDATING'
  },
  {
    id: 'task-003',
    fileName: '通州区卫星影像.tif',
    fileSize: 1024 * 1024 * 1500,
    progress: 0,
    status: 'PENDING'
  }
];

export const fileTypeLabels: Record<string, string> = {
  DWG: 'AutoCAD 图纸',
  SHP: 'Shapefile 矢量',
  GDB: '地理数据库',
  TIF: '遥感影像',
  OTHER: '其他格式'
};

export const statusLabels: Record<string, string> = {
  UPLOADING: '上传中',
  VALIDATING: '校验中',
  PENDING: '待质检',
  QUALITY_CHECKING: '质检中',
  APPROVED: '已通过',
  REJECTED: '已驳回'
};

export const statusColors: Record<string, string> = {
  UPLOADING: 'blue',
  VALIDATING: 'cyan',
  PENDING: 'orange',
  QUALITY_CHECKING: 'purple',
  APPROVED: 'green',
  REJECTED: 'red'
};

export const coordinateSystems = [
  'CGCS2000',
  'WGS84',
  'Beijing54',
  'Xian80',
  'UTM'
];

export const scales = [
  '1:500',
  '1:1000',
  '1:2000',
  '1:5000',
  '1:10000'
];
