import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { FormatoCaptura } from '../enums/formato-captura.enum.js';
import { OrigemAnuncio } from '../enums/origem-anuncio.enum.js';
import { StatusCapturaBruta } from '../enums/status-captura-bruta.enum.js';
import { TipoPaginaCaptura } from '../enums/tipo-pagina-captura.enum.js';
import { TipoTransacao } from '../enums/tipo-transacao.enum.js';

/**
 * Um registro por PÁGINA capturada — de LISTAGEM/busca (N cards dentro, um link por
 * anúncio) ou de DETALHE (a página do próprio anúncio, uma por link único descoberto na
 * listagem — ver `tipoPagina`). Guarda só o ponteiro pro objeto no bucket + metadados de
 * controle; o conteúdo em si nunca passa pelo Postgres.
 */
@Entity('capturas_brutas')
@Index(['origem', 'status'])
export class CapturaBruta {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'enum', enum: OrigemAnuncio })
  declare origem: OrigemAnuncio;

  // Nullable: nem toda fonte futura necessariamente segmenta a URL de busca por tipo de
  // transação.
  @Column({
    type: 'enum',
    enum: TipoTransacao,
    name: 'transaction_type',
    nullable: true,
  })
  declare tipoTransacao: TipoTransacao | null;

  @Column({ type: 'enum', enum: FormatoCaptura })
  declare formato: FormatoCaptura;

  // Default LISTAGEM a nível de banco: cada registro criado antes desta coluna existir
  // era, por definição, captura de página de listagem (a fase de detalhe não existia).
  @Column({
    type: 'enum',
    enum: TipoPaginaCaptura,
    name: 'page_type',
    default: TipoPaginaCaptura.LISTAGEM,
  })
  declare tipoPagina: TipoPaginaCaptura;

  @Column({
    type: 'enum',
    enum: StatusCapturaBruta,
    default: StatusCapturaBruta.PENDENTE,
  })
  declare status: StatusCapturaBruta;

  @Column({ type: 'text' })
  declare url: string;

  // Nome do bucket no momento da captura, não só lido de env var — auditoria caso o
  // bucket mude de nome no futuro.
  @Column({ type: 'text' })
  declare bucket: string;

  @Column({ type: 'text', name: 'object_key', unique: true })
  declare chaveObjeto: string;

  @Column({ type: 'text', name: 'content_hash' })
  declare hashConteudo: string;

  @Column({ type: 'int', name: 'size_bytes' })
  declare tamanhoBytes: number;

  @Column({ type: 'timestamptz', name: 'captured_at' })
  declare capturadoEm: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  declare updatedAt: Date;
}
