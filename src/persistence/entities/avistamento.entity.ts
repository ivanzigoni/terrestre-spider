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
import { CapturaBruta } from './captura-bruta.entity.js';

@Entity('avistamentos')
@Index(['anuncioId'])
export class Avistamento {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'int', name: 'anuncio_id' })
  declare anuncioId: number;

  @ManyToOne(() => Anuncio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'anuncio_id' })
  declare anuncio: Anuncio;

  @Column({ type: 'int', name: 'captura_bruta_id', unique: true })
  declare capturaBrutaId: number;

  @ManyToOne(() => CapturaBruta)
  @JoinColumn({ name: 'captura_bruta_id' })
  declare capturaBruta: CapturaBruta;

  @Column({ type: 'timestamptz', name: 'observado_em' })
  declare observadoEm: Date;

  @Column({ type: 'text' })
  declare url: string;

  @Column({ type: 'int', name: 'preco_venda', nullable: true })
  declare precoVenda: number | null;

  @Column({ type: 'int', name: 'preco_aluguel', nullable: true })
  declare precoAluguel: number | null;

  @Column({ type: 'int', nullable: true })
  declare condominio: number | null;

  @Column({ type: 'int', nullable: true })
  declare iptu: number | null;

  @Column({ type: 'double precision', nullable: true })
  declare area: number | null;

  @Column({ type: 'smallint', nullable: true })
  declare quartos: number | null;

  @Column({ type: 'smallint', nullable: true })
  declare suites: number | null;

  @Column({ type: 'smallint', nullable: true })
  declare banheiros: number | null;

  @Column({ type: 'smallint', nullable: true })
  declare vagas: number | null;

  @Column({ type: 'text', name: 'tipo_imovel_bruto', nullable: true })
  declare tipoImovelBruto: string | null;

  @Column({ type: 'text', nullable: true })
  declare bairro: string | null;

  @Column({ type: 'text', nullable: true })
  declare cidade: string | null;

  @Column({ type: 'text', nullable: true })
  declare estado: string | null;

  @Column({ type: 'text', nullable: true })
  declare cep: string | null;

  @Column({ type: 'text', nullable: true })
  declare endereco: string | null;

  @Column({ type: 'text', nullable: true })
  declare numero: string | null;

  @Column({ type: 'double precision', nullable: true })
  declare latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  declare longitude: number | null;

  @Column({ type: 'text', nullable: true })
  declare descricao: string | null;

  @Column({ type: 'text', name: 'anunciante_nome', nullable: true })
  declare anuncianteNome: string | null;

  @Column({ type: 'text', name: 'codigo_creci', nullable: true })
  declare codigoCreci: string | null;

  @Column({ type: 'timestamptz', name: 'publicado_em', nullable: true })
  declare publicadoEm: Date | null;

  @Column({ type: 'timestamptz', name: 'atualizado_em', nullable: true })
  declare atualizadoEm: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  declare createdAt: Date;
}
