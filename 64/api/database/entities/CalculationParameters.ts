import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

@Entity()
export class CalculationParameters {
  @PrimaryColumn('varchar', { length: 36 })
  id: string = uuidv4();

  @Column({ type: 'varchar', length: 36, unique: true })
  @Index()
  taskId: string;

  @Column({ type: 'int' })
  gridSize: number;

  @Column({ type: 'int' })
  timeSteps: number;

  @Column({ type: 'simple-json' })
  soilProperties: Record<string, unknown>;

  @Column({ type: 'simple-json' })
  loadConditions: Record<string, unknown>[];

  @Column({ type: 'simple-json' })
  boundaryConditions: Record<string, unknown>;
}
