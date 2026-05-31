import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';
import { TaskStatus } from '@shared/types';

@Entity('upgrade_tasks')
export class UpgradeTaskEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ name: 'firmware_id' })
  firmwareId: string;

  @Column({ name: 'terminal_ids', type: 'simple-json' })
  terminalIds: string[];

  @Column({
    type: 'simple-enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING
  })
  status: TaskStatus;

  @Column({ type: 'float', default: 0 })
  progress: number;

  @Column({ name: 'completed_count', default: 0 })
  completedCount: number;

  @Column({ name: 'total_count', default: 0 })
  totalCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt?: Date;

  @Column({ name: 'error_message', nullable: true, type: 'text' })
  errorMessage?: string;
}
