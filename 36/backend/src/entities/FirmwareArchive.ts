import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('firmware_archives')
@Index(['projectId', 'version'])
@Index(['projectId', 'uploadTime'])
@Index(['projectId', 'version', 'buildNumber'])
@Index(['md5'])
@Index(['projectName', 'uploadTime'])
export class FirmwareArchive {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column('varchar', { length: 36 })
  @Index()
  projectId!: string;

  @Column('varchar', { length: 255 })
  projectName!: string;

  @Column('varchar', { length: 50 })
  @Index()
  version!: string;

  @Column('int', { default: 1 })
  buildNumber!: number;

  @Column('bigint')
  fileSize!: number;

  @Column('varchar', { length: 32 })
  @Index()
  md5!: string;

  @Column('bigint')
  @Index()
  uploadTime!: number;

  @Column('varchar', { length: 100, default: 'system' })
  uploader!: string;

  @Column('varchar', { length: 500 })
  filePath!: string;

  @Column('simple-array', { default: '' })
  tags!: string[];

  @Column('text', { default: '' })
  description!: string;

  @Column('simple-json', { nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column('boolean', { default: false })
  @Index()
  isLatest!: boolean;

  @Column('varchar', { length: 50, nullable: true })
  previousVersion!: string | null;

  @Column('varchar', { length: 36, nullable: true })
  rollbackFromId!: string | null;
}
