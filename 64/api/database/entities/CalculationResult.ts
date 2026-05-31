import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

@Entity()
export class CalculationResult {
  @PrimaryColumn('varchar', { length: 36 })
  id: string = uuidv4();

  @Column({ type: 'varchar', length: 36 })
  @Index()
  taskId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index()
  shardId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index()
  nodeId: string;

  @Column({ type: 'simple-json' })
  settlementData: number[][];

  @Column({ type: 'simple-json' })
  stressData: number[][];

  @Column({ type: 'simple-json' })
  displacementData: number[][];

  @Column({ type: 'simple-json' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}
