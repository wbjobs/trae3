import type { ArchiveMetadata, QualityRecord, UploadTask } from '../../shared/types.js';
import { v4 as uuidv4 } from 'uuid';

export class DataStore {
  private static instance: DataStore;
  private archives: Map<string, ArchiveMetadata> = new Map();
  private qualityRecords: Map<string, QualityRecord> = new Map();
  private uploadTasks: Map<string, UploadTask> = new Map();

  private constructor() {
    this.initMockData();
  }

  public static getInstance(): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    return DataStore.instance;
  }

  private initMockData() {
    const mockArchives: ArchiveMetadata[] = [
      {
        id: 'archive-001',
        projectName: '北京市朝阳区地形测绘项目',
        coordinateSystem: 'CGCS2000',
        scale: '1:500',
        surveyArea: '北京市朝阳区',
        fileType: 'DWG',
        fileSize: 52428800,
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
        fileSize: 125829120,
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
        fileSize: 524288000,
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
        fileSize: 838860800,
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
        fileSize: 89128960,
        fileName: 'gaoxin_pipeline.dwg',
        filePath: '/storage/archives/gaoxin_pipeline_1705635600000.dwg',
        uploader: '赵管线',
        uploadTime: '2024-01-19 11:00:00',
        status: 'VALIDATING',
        version: 1
      }
    ];

    mockArchives.forEach(archive => this.archives.set(archive.id, archive));

    const mockRecords: QualityRecord[] = [
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
          }
        ]
      }
    ];

    mockRecords.forEach(record => this.qualityRecords.set(record.id, record));
  }

  getArchives(): ArchiveMetadata[] {
    return Array.from(this.archives.values());
  }

  getArchiveById(id: string): ArchiveMetadata | undefined {
    return this.archives.get(id);
  }

  addArchive(archive: Omit<ArchiveMetadata, 'id'>): ArchiveMetadata {
    const id = uuidv4();
    const newArchive = { ...archive, id } as ArchiveMetadata;
    this.archives.set(id, newArchive);
    return newArchive;
  }

  updateArchiveStatus(id: string, status: ArchiveMetadata['status'], qualityScore?: number): boolean {
    const archive = this.archives.get(id);
    if (archive) {
      archive.status = status;
      if (qualityScore !== undefined) {
        archive.qualityScore = qualityScore;
      }
      return true;
    }
    return false;
  }

  updateArchive(id: string, updates: Partial<ArchiveMetadata>): boolean {
    const archive = this.archives.get(id);
    if (archive) {
      Object.assign(archive, updates);
      return true;
    }
    return false;
  }

  searchArchives(filters: {
    keyword?: string;
    fileType?: string[];
    status?: string[];
    coordinateSystem?: string[];
    scale?: string[];
  }): ArchiveMetadata[] {
    return this.getArchives().filter(archive => {
      if (filters.keyword) {
        const keyword = filters.keyword.toLowerCase();
        if (!archive.projectName.toLowerCase().includes(keyword) &&
            !archive.surveyArea.toLowerCase().includes(keyword)) {
          return false;
        }
      }
      if (filters.fileType?.length && !filters.fileType.includes(archive.fileType)) {
        return false;
      }
      if (filters.status?.length && !filters.status.includes(archive.status)) {
        return false;
      }
      if (filters.coordinateSystem?.length && !filters.coordinateSystem.includes(archive.coordinateSystem)) {
        return false;
      }
      if (filters.scale?.length && !filters.scale.includes(archive.scale)) {
        return false;
      }
      return true;
    });
  }

  getQualityRecordsByArchiveId(archiveId: string): QualityRecord[] {
    return Array.from(this.qualityRecords.values())
      .filter(r => r.archiveId === archiveId);
  }

  addQualityRecord(record: Omit<QualityRecord, 'id'>): QualityRecord {
    const id = uuidv4();
    const newRecord = { ...record, id } as QualityRecord;
    this.qualityRecords.set(id, newRecord);
    return newRecord;
  }

  getUploadTasks(): UploadTask[] {
    return Array.from(this.uploadTasks.values());
  }

  addUploadTask(task: Omit<UploadTask, 'id'>): UploadTask {
    const id = uuidv4();
    const newTask = { ...task, id } as UploadTask;
    this.uploadTasks.set(id, newTask);
    return newTask;
  }

  updateUploadTask(id: string, updates: Partial<UploadTask>): boolean {
    const task = this.uploadTasks.get(id);
    if (task) {
      Object.assign(task, updates);
      return true;
    }
    return false;
  }

  getStatistics() {
    const archives = this.getArchives();
    return {
      total: archives.length,
      approved: archives.filter(a => a.status === 'APPROVED').length,
      pending: archives.filter(a => a.status === 'PENDING').length,
      totalSize: archives.reduce((sum, a) => sum + a.fileSize, 0)
    };
  }
}

export default DataStore.getInstance();
