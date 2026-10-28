import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../common/numeric.transformer';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'properties' })
export class Property {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_id' })
  agent?: User;

  @Column({ length: 160 })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ length: 80 })
  city: string;

  @Column({ length: 10 })
  postcode: string;

  @Column({ type: 'numeric', precision: 3, scale: 1, transformer: numericTransformer })
  rooms: number;

  @Column({ name: 'size_sqm', type: 'integer' })
  sizeSqm: number;

  /** Stored in cents to avoid floating point money. */
  @Column({ name: 'monthly_rent_cents', type: 'integer' })
  monthlyRentCents: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
