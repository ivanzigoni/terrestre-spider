import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { Avistamento } from './avistamento.entity.js';
import { Endereco } from './endereco.entity.js';

@Entity('avistamento_endereco')
@Unique(['avistamentoId', 'tipo'])
export class AvistamentoEndereco {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'int', name: 'avistamento_id' })
  declare avistamentoId: number;

  @ManyToOne(() => Avistamento, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'avistamento_id' })
  declare avistamento: Avistamento;

  @Column({ type: 'int', name: 'endereco_id' })
  @Index()
  declare enderecoId: number;

  @ManyToOne(() => Endereco)
  @JoinColumn({ name: 'endereco_id' })
  declare endereco: Endereco;

  @Column({ type: 'text' })
  declare tipo: 'original' | 'processado';

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  declare createdAt: Date;
}
