import { Entity, Column, PrimaryColumn, CreateDateColumn, Index } from 'typeorm';
import { LogLevel } from '@shared/types';

@Entity('logs')
@Index(['module', 'createdAt'])
export class LogEntity {
  @PrimaryColumn()
  id: string;

  @Column({
    type: 'simple-enum',
    enum: LogLevel,
    default: LogLevel.INFO
  })
  level: LogLevel;

  @Column()
  module: string;

  @Column()
  action: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ nullable: true, type: 'simple-json' })
  details?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
