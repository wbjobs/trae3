import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';
import { TerminalUpgradeStatus } from '@shared/types';

@Entity('task_progress')
export class TaskProgressEntity {
  @PrimaryColumn({ name: 'task_id' })
  taskId: string;

  @PrimaryColumn({ name: 'terminal_id' })
  terminalId: string;

  @Column({
    type: 'simple-enum',
    enum: TerminalUpgradeStatus,
    default: TerminalUpgradeStatus.PENDING
  })
  status: TerminalUpgradeStatus;

  @Column({ type: 'float', default: 0 })
  progress: number;

  @Column({ nullable: true, type: 'text' })
  message?: string;

  @CreateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
