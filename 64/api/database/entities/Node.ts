import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NodeStatus } from '../../../shared/types';

@Entity()
export class Node {
  @PrimaryColumn('varchar', { length: 36 })
  id: string = uuidv4();

  @Column({ type: 'varchar', length: 100, unique: true })
  @Index()
  name: string;

  @Column({ type: 'varchar', length: 45 })
  @Index()
  ipAddress: string;

  @Column({ type: 'varchar', length: 20, default: NodeStatus.OFFLINE })
  @Index()
  status: NodeStatus;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  cpuUsage: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  memoryUsage: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  diskUsage: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  networkUsage: number;

  @Column({ type: 'int', default: 0 })
  runningTasks: number;

  @Column({ type: 'int', default: 0 })
  totalTasks: number;

  @Column({ type: 'datetime' })
  lastHeartbeat: Date;

  @CreateDateColumn({ type: 'datetime' })
  registeredAt: Date;
}
