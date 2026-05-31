import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('firmwares')
export class FirmwareEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  version: string;

  @Column()
  model: string;

  @Column({ type: 'bigint' })
  size: number;

  @Column()
  md5: string;

  @Column()
  sha256: string;

  @Column({ name: 'file_path' })
  filePath: string;

  @Column({ name: 'upload_time', type: 'datetime' })
  uploadTime: Date;

  @Column({ name: 'uploaded_by' })
  uploadedBy: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;
}
