import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FileRecord } from './file-record.entity';

@Entity('desensitized_files')
export class DesensitizedFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'file_id' })
  fileId: string;

  @ManyToOne(() => FileRecord, (file) => file.desensitizedFiles)
  @JoinColumn({ name: 'file_id' })
  file: FileRecord;

  @Column({ name: 'original_text', type: 'text' })
  originalText: string;

  @Column({ name: 'desensitized_text', type: 'text' })
  desensitizedText: string;

  @Column({ name: 'match_count', default: 0 })
  matchCount: number;

  @Column({ name: 'match_types', type: 'jsonb', nullable: true })
  matchTypes: Record<string, any>;

  @Column({ default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
