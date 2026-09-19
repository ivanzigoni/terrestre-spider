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
import { Regional } from './regional.entity.js';

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

  @Column({ type: 'int', name: 'preco_venda_centavos', nullable: true })
  declare precoVendaCentavos: number | null;

  @Column({ type: 'int', name: 'preco_aluguel_centavos', nullable: true })
  declare precoAluguelCentavos: number | null;

  @Column({ type: 'boolean', name: 'disponivel_aluguel', nullable: true })
  declare disponivelAluguel: boolean | null;

  @Column({ type: 'boolean', name: 'disponivel_venda', nullable: true })
  declare disponivelVenda: boolean | null;

  @Column({ type: 'int', name: 'condominio_centavos', nullable: true })
  declare condominioCentavos: number | null;

  @Column({ type: 'int', name: 'iptu_centavos', nullable: true })
  declare iptuCentavos: number | null;

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

  @Column({ type: 'int', name: 'regional_id', nullable: true })
  declare regionalId: number | null;

  @ManyToOne(() => Regional)
  @JoinColumn({ name: 'regional_id' })
  declare regionalEntity: Regional | null;

  @Column({ type: 'text', nullable: true })
  declare descricao: string | null;

  @Column({ type: 'text', name: 'imagem_url', nullable: true })
  declare imagemUrl: string | null;

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
