import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { FileRecord, FileStatus, ClassificationLevel } from './entities/file-record.entity';
import { DesensitizedFile } from './entities/desensitized-file.entity';
import { MinioProvider } from './minio.provider';
import { FileFilterDto } from './dto/upload.dto';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket = process.env.MINIO_BUCKET || 'classified-files';

  constructor(
    @InjectRepository(FileRecord)
    private readonly fileRecordRepo: Repository<FileRecord>,
    @InjectRepository(DesensitizedFile)
    private readonly desensitizedFileRepo: Repository<DesensitizedFile>,
    private readonly minioProvider: MinioProvider,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    metadata: { department: string; classification: string; tags?: string[]; uploadedBy?: string },
  ): Promise<FileRecord> {
    const fileUuid = uuidv4();
    const now = new Date();
    const minioKey = `${metadata.department}/${now.getFullYear()}/${now.getMonth() + 1}/${fileUuid}/${file.originalname}`;

    await this.minioProvider.ensureBucket(this.bucket);
    await this.minioProvider.putObject(
      this.bucket,
      minioKey,
      file.buffer,
      file.size,
      { 'content-type': file.mimetype },
    );

    const record = this.fileRecordRepo.create({
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      minioKey,
      status: FileStatus.UPLOADED,
      uploadedBy: metadata.uploadedBy,
      department: metadata.department,
      classification: metadata.classification as ClassificationLevel,
      tags: metadata.tags || [],
    });

    return this.fileRecordRepo.save(record);
  }

  async getFiles(filter: FileFilterDto): Promise<{ data: FileRecord[]; total: number; page: number; limit: number }> {
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.fileRecordRepo.createQueryBuilder('file');

    if (filter.status) {
      qb.andWhere('file.status = :status', { status: filter.status });
    }
    if (filter.classification) {
      qb.andWhere('file.classification = :classification', { classification: filter.classification });
    }
    if (filter.department) {
      qb.andWhere('file.department = :department', { department: filter.department });
    }
    if (filter.search) {
      qb.andWhere('file.original_name ILIKE :search', { search: `%${filter.search}%` });
    }

    qb.andWhere('file.deleted_at IS NULL');
    qb.orderBy('file.created_at', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { items: data, data, total, page, limit };
  }

  async getFile(id: string): Promise<FileRecord> {
    const record = await this.fileRecordRepo.findOne({ where: { id } as FindOptionsWhere<FileRecord> });
    if (!record || record.deletedAt) {
      throw new NotFoundException(`File record ${id} not found`);
    }
    return record;
  }

  async deleteFile(id: string): Promise<void> {
    const record = await this.getFile(id);
    record.deletedAt = new Date();
    await this.fileRecordRepo.save(record);
  }

  async downloadFile(id: string): Promise<{ buffer: Buffer; record: FileRecord }> {
    const record = await this.getFile(id);
    const buffer = await this.minioProvider.getObject(this.bucket, record.minioKey);
    return { buffer, record };
  }

  async downloadDesensitized(id: string): Promise<{ buffer: Buffer; record: FileRecord }> {
    const record = await this.getFile(id);
    if (!record.desensitizedMinioKey) {
      throw new NotFoundException(`Desensitized file for ${id} not found`);
    }
    const buffer = await this.minioProvider.getObject(this.bucket, record.desensitizedMinioKey);
    return { buffer, record };
  }

  async storeDesensitized(
    id: string,
    text: string,
    desensitizedData?: {
      originalText: string;
      desensitizedText: string;
      matchCount: number;
      matchTypes: Record<string, any>;
    },
  ): Promise<FileRecord> {
    const record = await this.getFile(id);

    const fileUuid = uuidv4();
    const now = new Date();
    const desensitizedKey = `${record.department}/${now.getFullYear()}/${now.getMonth() + 1}/${fileUuid}/desensitized.txt`;

    const buffer = Buffer.from(text, 'utf-8');
    await this.minioProvider.putObject(this.bucket, desensitizedKey, buffer, buffer.length, {
      'content-type': 'text/plain',
    });

    record.desensitizedMinioKey = desensitizedKey;
    record.status = FileStatus.DESENSITIZED;
    const savedRecord = await this.fileRecordRepo.save(record);

    if (desensitizedData) {
      const desensitizedFile = this.desensitizedFileRepo.create({
        fileId: id,
        originalText: desensitizedData.originalText,
        desensitizedText: desensitizedData.desensitizedText,
        matchCount: desensitizedData.matchCount,
        matchTypes: desensitizedData.matchTypes,
        version: 1,
      });
      await this.desensitizedFileRepo.save(desensitizedFile);
    }

    return savedRecord;
  }

  async updateParseResult(id: string, parseResult: string): Promise<FileRecord> {
    const record = await this.getFile(id);
    record.parseResult = parseResult;
    record.status = FileStatus.PARSED;
    return this.fileRecordRepo.save(record);
  }

  async updateStatus(id: string, status: string): Promise<FileRecord> {
    const record = await this.getFile(id);
    record.status = status as FileStatus;
    return this.fileRecordRepo.save(record);
  }
}
