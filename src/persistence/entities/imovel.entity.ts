import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { OrigemAnuncio } from '../enums/origem-anuncio.enum.js';
import { TipoTransacao } from '../enums/tipo-transacao.enum.js';
import { ObservacaoPreco } from './observacao-preco.entity.js';

@Entity('imoveis')
export class Imovel {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'text', unique: true })
  declare link: string;

  @Column({ type: 'text' })
  declare title: string;

  @Column({ type: 'int', default: 0 })
  declare bedrooms: number;

  @Column({ type: 'int', default: 0 })
  declare bathrooms: number;

  @Column({ type: 'int', nullable: true, name: 'parking_spots' })
  declare parkingSpots: number | null;

  @Column({ type: 'int', default: 0 })
  declare area: number;

  @Column({ type: 'text' })
  declare location: string;

  @Column({ type: 'enum', enum: OrigemAnuncio })
  declare origin: OrigemAnuncio;

  @Column({ type: 'enum', enum: TipoTransacao, name: 'transaction_type' })
  declare transactionType: TipoTransacao;

  // Vocabulário de cada site, sem normalizar entre fontes — granularidade varia
  // (ex.: OLX só distingue "imoveis" de "terrenos" no HTML servido, sem JS).
  @Column({ type: 'text', nullable: true, name: 'property_type' })
  declare propertyType: string | null;

  @Column({ type: 'text', nullable: true, name: 'date_posted_text' })
  declare datePostedText: string | null;

  @Column({ type: 'int', name: 'current_price' })
  declare currentPrice: number;

  @Column({ type: 'int', default: 0, name: 'current_iptu' })
  declare currentIptu: number;

  @Column({ type: 'int', default: 0, name: 'current_condominio' })
  declare currentCondominio: number;

  @Column({ type: 'int', name: 'current_total_price' })
  declare currentTotalPrice: number;

  @Column({ type: 'int', nullable: true, name: 'old_price' })
  declare oldPrice: number | null;

  @Column({ type: 'boolean', default: true })
  declare active: boolean;

  @Column({ type: 'timestamptz', name: 'first_seen_at' })
  declare firstSeenAt: Date;

  @Column({ type: 'timestamptz', name: 'last_seen_at' })
  declare lastSeenAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  declare updatedAt: Date;

  @OneToMany(() => ObservacaoPreco, (observacao) => observacao.imovel)
  declare observacoesPreco: ObservacaoPreco[];
}
