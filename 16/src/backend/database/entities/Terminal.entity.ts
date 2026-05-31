import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TerminalStatus } from '@shared/types';
import { TerminalGroupEntity } from './TerminalGroup.entity';

@Entity('terminals')
export class TerminalEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  ip: string;

  @Column({ unique: true })
  mac: string;

  @Column()
  model: string;

  @Column({ name: 'firmware_version' })
  firmwareVersion: string;

  @Column({
    type: 'simple-enum',
    enum: TerminalStatus,
    default: TerminalStatus.OFFLINE
  })
  status: TerminalStatus;

  @Column({ name: 'group_id', nullable: true })
  groupId?: string;

  @ManyToOne(() => TerminalGroupEntity, group => group.terminals, { nullable: true })
  @JoinColumn({ name: 'group_id' })
  group?: TerminalGroupEntity;

  @Column({ name: 'last_seen', type: 'datetime' })
  lastSeen: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
