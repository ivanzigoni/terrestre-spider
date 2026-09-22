import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Bairro } from './bairro.entity.js';

@Entity('enderecos')
export class Endereco {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'text' })
  declare tipo: 'original' | 'processado';

  @Column({ type: 'text', nullable: true })
  declare endereco: string | null;

  @Column({ type: 'text', nullable: true })
  declare numero: string | null;

  @Column({ type: 'text', nullable: true })
  declare bairro: string | null;

  @Column({ type: 'int', name: 'bairro_id', nullable: true })
  declare bairroId: number | null;

  @ManyToOne(() => Bairro)
  @JoinColumn({ name: 'bairro_id' })
  declare bairroEntity: Bairro | null;

  @Column({ type: 'text', nullable: true })
  declare cidade: string | null;

  @Column({ type: 'text', nullable: true })
  declare estado: string | null;

  @Column({ type: 'text', nullable: true })
  declare cep: string | null;

  @Column({ type: 'double precision', nullable: true })
  declare latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  declare longitude: number | null;
}
