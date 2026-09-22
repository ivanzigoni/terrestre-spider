import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Bairro } from './bairro.entity.js';
import { Regional } from './regional.entity.js';

@Entity('bairros_regionais')
export class BairroRegional {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'int', name: 'bairro_id', unique: true })
  declare bairroId: number;

  @ManyToOne(() => Bairro)
  @JoinColumn({ name: 'bairro_id' })
  declare bairro: Bairro;

  @Column({ type: 'int', name: 'regional_id' })
  declare regionalId: number;

  @ManyToOne(() => Regional)
  @JoinColumn({ name: 'regional_id' })
  declare regional: Regional;

  @Column({ type: 'text' })
  declare territorio: string;
}
