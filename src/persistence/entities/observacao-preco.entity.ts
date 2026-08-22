import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Imovel } from './imovel.entity.js';
import type { RelationRef } from './relation-ref.js';

@Entity('observacoes_preco')
@Index(['imovel', 'scrapedAt'])
export class ObservacaoPreco {
  @PrimaryGeneratedColumn()
  declare id: number;

  @ManyToOne(() => Imovel, (imovel) => imovel.observacoesPreco, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'imovel_id' })
  declare imovel: RelationRef<Imovel>;

  @Column({ type: 'int' })
  declare price: number;

  @Column({ type: 'int', default: 0 })
  declare iptu: number;

  @Column({ type: 'int', default: 0 })
  declare condominio: number;

  @Column({ type: 'int', name: 'total_price' })
  declare totalPrice: number;

  @Column({ type: 'timestamptz', name: 'scraped_at' })
  declare scrapedAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  declare createdAt: Date;
}
