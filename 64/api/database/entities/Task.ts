import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TaskStatus } from '../../../shared/types';

@Entity()
export class Task {
  @PrimaryColumn('varchar', { length: 36 })
  id: string = uuidv4();

  @Column({ type: 'varchar', length: 36 })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 200 })
  @Index()
  name: string;

  @Column({ type: 'varchar', length: 20, default: TaskStatus.PENDING })
  @Index()
  status: TaskStatus;

  @Column({ type: 'int', default: 5 })
  priority: number;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'int', default: 1 })
  totalShards: number;

  @Column({ type: 'int', default: 0 })
  completedShards: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  modelFilePath: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'datetime' })
  @Index()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;
}
