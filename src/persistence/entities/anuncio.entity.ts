import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { OrigemAnuncio } from '../enums/origem-anuncio.enum.js';
import { TipoAnuncio } from '../enums/tipo-anuncio.enum.js';
import { TipoTransacao } from '../enums/tipo-transacao.enum.js';
import { ObservacaoPreco } from './observacao-preco.entity.js';
import type { RelationRef } from './relation-ref.js';

@Entity('anuncios')
export class Anuncio {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'text', unique: true })
  declare link: string;

  @Column({ type: 'text' })
  declare titulo: string;

  @Column({ type: 'int', default: 0 })
  declare quartos: number;

  @Column({ type: 'int', default: 0 })
  declare banheiros: number;

  @Column({ type: 'int', nullable: true, name: 'parking_spots' })
  declare vagas: number | null;

  @Column({ type: 'int', default: 0 })
  declare area: number;

  @Column({ type: 'text' })
  declare localizacao: string;

  @Column({ type: 'enum', enum: OrigemAnuncio })
  declare origem: OrigemAnuncio;

  // Categoria do anúncio (o que está sendo anunciado), não o tipo do imóvel dentro dela
  // — ver comentário em TipoAnuncio. Hoje só existe o valor IMOVEL.
  @Column({ type: 'enum', enum: TipoAnuncio, name: 'ad_type' })
  declare tipoAnuncio: TipoAnuncio;

  @Column({ type: 'enum', enum: TipoTransacao, name: 'transaction_type' })
  declare tipoTransacao: TipoTransacao;

  // Vocabulário de cada site, sem normalizar entre fontes — granularidade varia
  // (ex.: OLX só distingue "imoveis" de "terrenos" no HTML servido, sem JS).
  @Column({ type: 'text', nullable: true, name: 'property_type' })
  declare tipoImovel: string | null;

  @Column({ type: 'text', nullable: true, name: 'date_posted_text' })
  declare dataDePublicacaoText: string | null;

  @Column({ type: 'int', name: 'current_price' })
  declare precoAtual: number;

  @Column({ type: 'int', default: 0, name: 'current_iptu' })
  declare iptuAtual: number;

  @Column({ type: 'int', default: 0, name: 'current_condominio' })
  declare condominioAtual: number;

  @Column({ type: 'int', name: 'current_total_price' })
  declare precoTotalAtual: number;

  @Column({ type: 'int', nullable: true, name: 'old_price' })
  declare precoAntigo: number | null;

  @Column({ type: 'boolean', default: true })
  declare ativo: boolean;

  @Column({ type: 'timestamptz', name: 'first_seen_at' })
  declare vistoPelaPrimeiraVezEm: Date;

  @Column({ type: 'timestamptz', name: 'last_seen_at' })
  declare vistoPelaUltimaVezEm: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  declare updatedAt: Date;

  @OneToMany(() => ObservacaoPreco, (observacao) => observacao.anuncio)
  declare observacoesPreco: RelationRef<ObservacaoPreco>[];
}
