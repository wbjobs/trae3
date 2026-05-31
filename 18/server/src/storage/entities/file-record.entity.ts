import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { DesensitizedFile } from './desensitized-file.entity';

export enum FileStatus {
  UPLOADED = 'uploaded',
  PARSING = 'parsing',
  PARSED = 'parsed',
  DESENSITIZING = 'desensitizing',
  DESENSITIZED = 'desensitized',
  EMBEDDING = 'embedding',
  EMBEDDED = 'embedded',
  FAILED = 'failed',
}

export enum ClassificationLevel {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  SECRET = 'secret',
  TOP_SECRET = 'top-secret',
}

@Entity('file_records')
export class FileRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'original_name' })
  originalName: string;

  @Column({ name: 'mime_type' })
  mimeType: string;

  @Column({ name: 'file_size' })
  fileSize: number;

  @Column({ name: 'minio_key' })
  minioKey: string;

  @Column({ name: 'desensitized_minio_key', nullable: true })
  desensitizedMinioKey: string;

  @Column({ type: 'enum', enum: FileStatus, default: FileStatus.UPLOADED })
  status: FileStatus;

  @Column({ name: 'parse_result', type: 'text', nullable: true })
  parseResult: string;

  @Column({ name: 'uploaded_by', nullable: true })
  uploadedBy: string;

  @Column({ nullable: true })
  department: string;

  @Column({ type: 'enum', enum: ClassificationLevel, default: ClassificationLevel.INTERNAL })
  classification: ClassificationLevel;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;

  @OneToMany(() => DesensitizedFile, (df) => df.file)
  desensitizedFiles: DesensitizedFile[];
}
