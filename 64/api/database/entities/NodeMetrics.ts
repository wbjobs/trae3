import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

@Entity()
export class NodeMetrics {
  @PrimaryColumn('varchar', { length: 36 })
  id: string = uuidv4();

  @Column({ type: 'varchar', length: 36 })
  @Index()
  nodeId: string;

  @Column({ type: 'datetime' })
  @Index()
  timestamp: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  cpu: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  memory: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  disk: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  network: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  loadAvg1: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  loadAvg5: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  loadAvg15: number | null;
}
