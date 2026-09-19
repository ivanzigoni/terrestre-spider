import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Regional } from './regional.entity.js';

@Entity('bairros_regionais')
export class BairroRegional {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'text', unique: true })
  declare bairro: string;

  @Column({ type: 'int', name: 'regional_id' })
  declare regionalId: number;

  @ManyToOne(() => Regional)
  @JoinColumn({ name: 'regional_id' })
  declare regional: Regional;

  @Column({ type: 'text' })
  declare territorio: string;
}
