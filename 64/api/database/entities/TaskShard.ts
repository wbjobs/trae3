import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TaskStatus } from '../../../shared/types';

@Entity()
export class TaskShard {
  @PrimaryColumn('varchar', { length: 36 })
  id: string = uuidv4();

  @Column({ type: 'varchar', length: 36 })
  @Index()
  taskId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index()
  nodeId: string;

  @Column({ type: 'int' })
  shardIndex: number;

  @Column({ type: 'varchar', length: 20, default: TaskStatus.PENDING })
  @Index()
  status: TaskStatus;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;
}
