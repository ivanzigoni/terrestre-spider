import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Anuncio } from './anuncio.entity.js';
import type { RelationRef } from './relation-ref.js';

@Entity('observacoes_preco')
@Index(['anuncio', 'raspadoEm'])
export class ObservacaoPreco {
  @PrimaryGeneratedColumn()
  declare id: number;

  @ManyToOne(() => Anuncio, (anuncio) => anuncio.observacoesPreco, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'anuncio_id' })
  declare anuncio: RelationRef<Anuncio>;

  @Column({ type: 'int' })
  declare preco: number;

  @Column({ type: 'int', default: 0 })
  declare iptu: number;

  @Column({ type: 'int', default: 0 })
  declare condominio: number;

  @Column({ type: 'int', name: 'total_price' })
  declare precoTotal: number;

  @Column({ type: 'timestamptz', name: 'scraped_at' })
  declare raspadoEm: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  declare createdAt: Date;
}
