import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { OrigemAnuncio } from '../enums/origem-anuncio.enum.js';
import { StatusExecucao } from '../enums/status-execucao.enum.js';

@Entity('execucoes')
export class Execucao {
  @PrimaryGeneratedColumn()
  declare id: number;

  @Column({ type: 'enum', enum: OrigemAnuncio })
  declare origem: OrigemAnuncio;

  @Column({
    type: 'enum',
    enum: StatusExecucao,
    default: StatusExecucao.EM_ANDAMENTO,
  })
  declare status: StatusExecucao;

  @Column({ type: 'timestamptz', name: 'iniciada_em' })
  declare iniciadaEm: Date;

  @Column({ type: 'timestamptz', name: 'finalizada_em', nullable: true })
  declare finalizadaEm: Date | null;

  @Column({ type: 'int', name: 'requests_finalizados', nullable: true })
  declare requestsFinalizados: number | null;

  @Column({ type: 'int', name: 'requests_falhos', nullable: true })
  declare requestsFalhos: number | null;

  @Column({ type: 'text', name: 'mensagem_erro', nullable: true })
  declare mensagemErro: string | null;

  @Column({ type: 'int', name: 'requests_total', nullable: true })
  declare requestsTotal: number | null;

  @Column({ type: 'int', name: 'crawler_runtime_millis', nullable: true })
  declare crawlerRuntimeMillis: number | null;

  @Column({
    type: 'int',
    name: 'request_total_duration_millis',
    nullable: true,
  })
  declare requestTotalDurationMillis: number | null;

  @Column({
    type: 'double precision',
    name: 'request_avg_finished_duration_millis',
    nullable: true,
  })
  declare requestAvgFinishedDurationMillis: number | null;

  @Column({
    type: 'double precision',
    name: 'request_avg_failed_duration_millis',
    nullable: true,
  })
  declare requestAvgFailedDurationMillis: number | null;

  // Indexado por número de retentativas (índice 0 = sem retry) — ver
  // `sources/shared/crawl-stats.ts` para como é agregado entre sub-crawls.
  @Column({ type: 'jsonb', name: 'retry_histogram', nullable: true })
  declare retryHistogram: number[] | null;

  @Column({ type: 'int', name: 'anuncios_encontrados', nullable: true })
  declare anunciosEncontrados: number | null;

  @Column({ type: 'int', name: 'anuncios_unicos_detalhe', nullable: true })
  declare anunciosUnicosDetalhe: number | null;

  @Column({ type: 'int', name: 'capturas_brutas_enviadas', nullable: true })
  declare capturasBrutasEnviadas: number | null;
}
