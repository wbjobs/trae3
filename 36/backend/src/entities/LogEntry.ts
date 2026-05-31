import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('log_entries')
@Index(['projectId', 'timestamp'])
@Index(['buildId'])
@Index(['level', 'timestamp'])
export class LogEntry {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Column('bigint')
  @Index()
  timestamp!: number;

  @Column('varchar', { length: 20 })
  @Index()
  level!: 'info' | 'warn' | 'error' | 'debug';

  @Column('varchar', { length: 100 })
  source!: string;

  @Column('text')
  message!: string;

  @Column('varchar', { length: 36, nullable: true })
  @Index()
  projectId!: string | null;

  @Column('varchar', { length: 36, nullable: true })
  @Index()
  buildId!: string | null;

  @Column('simple-json', { nullable: true })
  metadata!: Record<string, unknown> | null;
}

@Entity('build_logs')
export class BuildLog {
  @PrimaryColumn('varchar', { length: 36 })
  buildId!: string;

  @Column('varchar', { length: 36, nullable: true })
  @Index()
  projectId!: string | null;

  @Column('text')
  content!: string;

  @Column('bigint')
  createdAt!: number;
}
