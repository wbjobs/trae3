import { Entity, Column, PrimaryColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TerminalEntity } from './Terminal.entity';

@Entity('terminal_groups')
export class TerminalGroupEntity {
  @PrimaryColumn()
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ name: 'terminal_count', default: 0 })
  terminalCount: number;

  @OneToMany(() => TerminalEntity, terminal => terminal.group)
  terminals: TerminalEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
